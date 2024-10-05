import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());

app.post('/api/v1/create-payment-link', async (req, res) => {
    try {
      const { productName, unitAmount, currency, quantity } = req.body;

      const price = await stripe.prices.create({
        unit_amount: unitAmount,  // Amount in the smallest currency unit (e.g., cents for USD)
        currency: currency,
        product_data: {
          name: productName,
        },
      });
  
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [
          {
            price: price.id,
            quantity: quantity || 1,
          },
        ],
      });

      res.status(201).json({ paymentLinkId: paymentLink.id, url: paymentLink.url });
    } catch (error) {
      console.error('Error creating payment link:', error.message);
      res.status(500).json({ error: error.message });
    }
});  

app.get('/api/v1/successful-payments', async (req, res) => {
    try {
      const paymentIntents = await stripe.paymentIntents.list({
        limit: 100,
      });
  
      const successfulPayments = paymentIntents.data.filter(
        (intent) => intent.status === 'succeeded'
      );
  
      const paymentStatuses = successfulPayments.map((intent) => ({
        id: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        created: new Date(intent.created * 1000).toISOString(),
      }));
  
      res.status(200).json({ successfulPayments: paymentStatuses });
    } catch (error) {
      console.error('Error fetching successful payments:', error.message);
      res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
