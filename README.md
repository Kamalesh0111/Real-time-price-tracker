# Real-Time Price Tracker Application

![Project Demo Screenshot](...) <!-- Optional: Add a screenshot of your app here -->

A full-stack price tracking application that allows users to monitor e-commerce products and receive instant email and browser push notifications when prices drop below their target.

## Key Features

-   **User Authentication:** Secure user sign-up and login using Supabase Auth.
-   **Product Tracking:** Users can add any product URL and set a target price alert.
-   **High-Concurrency Web Scraping:** A Go-based microservice uses goroutines to efficiently scrape product pages for price, name, and image data.
-   **Dual-Channel Notifications:** Instant alerts are delivered via both Web Push Notifications (for immediate on-device alerts) and Email (via SendGrid) for persistence.
-   **On-Demand Scraping:** Provides immediate feedback by scraping product details right after a user adds a new item.
-   **Interactive UI:** Users can re-enable triggered alerts and view long product titles with a "Show more" feature.

## Tech Stack & Architecture

-   **Frontend:** React (Vite) with Tailwind CSS.
-   **Backend API:** Express.js (Node.js).
-   **Database & Auth:** Supabase (PostgreSQL).
-   **Web Scraper:** Go with the Colly library.

The project uses a microservices-oriented architecture where each component is chosen for its strengths, ensuring performance and reliability.

## Getting Started

### Prerequisites

-   Node.js (v18+)
-   Go (v1.20+)
-   A Supabase account
-   A SendGrid account

### Local Setup

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/[YOUR_USERNAME]/[YOUR_REPO_NAME].git
    cd [YOUR_REPO_NAME]
    ```

2.  **Backend Setup:**
    ```bash
    cd backend-express
    npm install
    cp .env.example .env
    ```
    - Fill in the required values in `backend-express/.env`.

3.  **Frontend Setup:**
    ```bash
    cd ../frontend-react
    npm install
    cp .env.example .env
    ```
    - Fill in the required values in `frontend-react/.env`.

4.  **Scraper Setup:**
    - The scraper is configured via environment variables but defaults to the local setup.
    - To use the on-demand scraping feature, you must build the executable:
    ```bash
    cd ../scraper-go
    go build -o scraper .
    ```

### Running the Application

You will need three separate terminals:

1.  **Run the Backend:**
    ```bash
    cd backend-express
    npm run dev
    ```

2.  **Run the Scraper:**
    ```bash
    cd scraper-go
    go run main.go
    ```

3.  **Run the Frontend:**
    ```bash
    cd frontend-react
    npm run dev
    ```
- Access the app at `http://localhost:5173` (or the port specified by Vite).