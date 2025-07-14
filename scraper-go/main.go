package main

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "log"
    "net/http"
    "os"
    "strconv"
    "strings"
    "sync"
    "time"

    "github.com/gocolly/colly/v2"
)

// Product is what we fetch from backend
type Product struct {
    ID  string `json:"id"`
    URL string `json:"url"`
}

// ScrapeResult is sent back to backend
type ScrapeResult struct {
    ProductID string  `json:"product_id"`
    Name      string  `json:"name"`
    Price     float64 `json:"price"`
    ImageURL  string  `json:"image_url"`
}

var (
    backendAPI   = mustEnv("BACKEND_API", "http://localhost:4001")
    scrapePeriod = getEnvDuration("SCRAPE_PERIOD", 5*time.Minute)
    userAgent    = getEnv("USER_AGENT", "Mozilla/5.0 (compatible; PriceTracker/1.0)")
    maxConcurrent = getEnvInt("MAX_CONCURRENT", 10)
    httpTimeout  = getEnvDuration("HTTP_TIMEOUT", 15*time.Second)
)

func mustEnv(key, def string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return def
}

func getEnv(key, def string) string {
    return mustEnv(key, def)
}

func getEnvDuration(name string, def time.Duration) time.Duration {
    if v := os.Getenv(name); v != "" {
        if d, err := time.ParseDuration(v); err == nil {
            return d
        }
    }
    return def
}

func getEnvInt(name string, def int) int {
    if v := os.Getenv(name); v != "" {
        if i, err := strconv.Atoi(v); err == nil {
            return i
        }
    }
    return def
}

// getProductsToScrape fetches product list from Express
func getProductsToScrape(ctx context.Context) ([]Product, error) {
    req, _ := http.NewRequestWithContext(ctx, http.MethodGet, backendAPI+"/api/all-products", nil)
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, fmt.Errorf("fetch products: %w", err)
    }
    defer resp.Body.Close()

    if resp.StatusCode != http.StatusOK {
        return nil, fmt.Errorf("bad status: %s", resp.Status)
    }

    var products []Product
    if err := json.NewDecoder(resp.Body).Decode(&products); err != nil {
        return nil, fmt.Errorf("decode products: %w", err)
    }
    return products, nil
}

// scrapeProduct fetches and parses one product page
func scrapeProduct(ctx context.Context, product Product, results chan<- ScrapeResult) {
    c := colly.NewCollector(
        colly.UserAgent(userAgent),
        colly.Async(true),
    )
    // Limit concurrency per domain
    c.Limit(&colly.LimitRule{Parallelism: 1, DomainGlob: "*", Delay: 2 * time.Second})

    // Set up context timeout
    c.WithTransport(&http.Transport{ResponseHeaderTimeout: httpTimeout})

    var res ScrapeResult
    res.ProductID = product.ID

    // Grab title
    c.OnHTML("#productTitle, h1#title, #title_feature_div .a-size-large", func(e *colly.HTMLElement) {
        if res.Name == "" {
            res.Name = strings.TrimSpace(e.Text)
        }
    })

    // Grab image URL
    c.OnHTML("#landingImage", func(e *colly.HTMLElement) {
        res.ImageURL = e.Attr("src")
    })

    // Grab price (example selector)
    c.OnHTML(".a-price-whole", func(e *colly.HTMLElement) {
        raw := strings.ReplaceAll(e.Text, ",", "")
        if p, err := strconv.ParseFloat(strings.TrimSpace(raw), 64); err == nil {
            res.Price = p
        }
    })

    c.OnError(func(r *colly.Response, err error) {
        log.Printf("[ERROR] %s → %v", product.URL, err)
    })

    c.OnScraped(func(r *colly.Response) {
        // Fallback if parsing failed
        if res.Price == 0 {
            log.Printf("[WARN] Price not found for %s; defaulting to -1", product.URL)
            res.Price = -1
        }
        results <- res
    })

    // Respect context cancellation
    c.OnRequest(func(r *colly.Request) {
        select {
        case <-ctx.Done():
            r.Abort()
        default:
        }
    })

    c.Visit(product.URL)
    c.Wait()
}

// postScrapeResults pushes one result to Express
func postScrapeResults(ctx context.Context, r ScrapeResult) {
    body, _ := json.Marshal(r)
    req, _ := http.NewRequestWithContext(ctx, http.MethodPost, backendAPI+"/api/update-price",
        bytes.NewReader(body))
    req.Header.Set("Content-Type", "application/json")
    if _, err := http.DefaultClient.Do(req); err != nil {
        log.Printf("[ERROR] post result %s → %v", r.ProductID, err)
    }
}

func main() {
    log.Printf("Starting scraper: backend=%s interval=%s", backendAPI, scrapePeriod)

    ticker := time.NewTicker(scrapePeriod)
    defer ticker.Stop()

    for {
        ctx, cancel := context.WithTimeout(context.Background(), scrapePeriod)
        log.Println("Scrape cycle started")
        products, err := getProductsToScrape(ctx)
        if err != nil {
            log.Println("Failed to get products:", err)
            cancel()
            <-ticker.C
            continue
        }

        sem := make(chan struct{}, maxConcurrent)
        wg := sync.WaitGroup{}
        results := make(chan ScrapeResult, len(products))

        for _, p := range products {
            wg.Add(1)
            go func(prod Product) {
                defer wg.Done()
                sem <- struct{}{}          // acquire slot
                scrapeProduct(ctx, prod, results)
                <-sem                      // release slot
            }(p)
        }

        // Wait for all scrapes
        go func() {
            wg.Wait()
            close(results)
        }()

        // Post results
        for res := range results {
            postScrapeResults(ctx, res)
        }

        cancel()
        log.Println("Scrape cycle completed; waiting for next tick")
        <-ticker.C
    }
}
