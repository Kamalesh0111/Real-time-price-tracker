require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { createClient } = require('@supabase/supabase-js');
const webpush = require('web-push');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

webpush.setVapidDetails(
  `mailto:${process.env.EMAIL_FROM}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Endpoint for the Go scraper to get all products
app.get('/api/all-products', async (req, res) => {
  const { data, error } = await supabase.from('products').select('id, url');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Endpoint for the Go scraper to post updates
app.post('/api/update-price', async (req, res) => {
  const { product_id, name, image_url, price } = req.body;

  // 1. Update product info (name, image)
  await supabase.from('products').update({ name, image_url }).eq('id', product_id);

  // 2. Insert new price into history
  const { error: priceError } = await supabase.from('prices').insert({ product_id, price });
  if (priceError) {
    console.error('Error inserting price:', priceError);
    return res.status(500).json({ error: priceError.message });
  }

  res.status(200).json({ message: 'Price updated' });

  // 3. Check for alerts and trigger notifications (async)
  checkAndSendAlerts(product_id, price);
});

async function checkAndSendAlerts(productId, currentPrice) {
  // 1. Query the new VIEW instead of the 'alerts' table
  const { data: alerts, error } = await supabase
    .from('alerts_with_details') // <-- Querying the view
    .select('*')                 // <-- Just get all the pre-joined columns
    .eq('product_id', productId)
    .eq('is_active', true)
    .lte('target_price', currentPrice);

  if (error) {
    console.error('Error fetching alerts from view:', error);
    return;
  }

  // 2. The loop logic is now simpler
  for (const alert of alerts) {
    // All the data we need is directly on the 'alert' object
    const { email, url, product_name, id: alertId, user_id } = alert;

    console.log(`Alert triggered for ${email} on product ${product_name}`);

    // Create the objects needed for the notification functions
    const user = { email: email };
    const product = { name: product_name, url: url };

    // Send notifications
    sendEmailNotification(user.email, product, currentPrice);
    sendPushNotification(user_id, product, currentPrice);

    // Deactivate the original alert in the 'alerts' table
    await supabase.from('alerts').update({ is_active: false }).eq('id', alertId);
  }
}
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// In backend-express/index.js

async function sendEmailNotification(email, product, price) {
    try {
        const subject = `Price Drop Alert: ${product.name || 'Your Tracked Product'}`;
        const htmlBody = `The price for <b><a href="${product.url}">${product.name || 'your tracked product'}</a></b> has dropped to <b>₹${price}</b>!<br><br><p style="font-size:12px; color: #666;"></p>`;
        const textBody = `The price for ${product.name || 'your tracked product'} (${product.url}) has dropped to ₹${price}.`;

        await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to: email,
            subject: subject, // Use the more descriptive subject
            html: htmlBody,   // The HTML version of the email
            text: textBody,   // A plain text version for email clients that don't use HTML
        });

        console.log(`Email sent to ${email}`);
    } catch (error) {
        console.error(`Failed to send email to ${email}:`, error);
    }
}

async function sendPushNotification(userId, product, price) {
    const { data: subData } = await supabase
        .from('notifications')
        .select('subscription')
        .eq('user_id', userId)
        .single();

    if (subData) {
        const payload = JSON.stringify({
            title: 'Price Drop!',
            body: `${product.name} is now $${price}!`,
        });
        webpush.sendNotification(subData.subscription, payload)
            .catch(err => console.error('Push notification failed:', err));
    }
}

const PORT = 4001;
app.listen(PORT, () => console.log(`Backend server running on http://localhost:${PORT}`));