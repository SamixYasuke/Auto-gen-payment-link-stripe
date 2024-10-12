import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import cors from 'cors';
import { z } from 'zod';

dotenv.config();

const stripeLive = new Stripe(process.env.STRIPE_LIVE_KEY);
const stripeTest = new Stripe(process.env.STRIPE_TEST_KEY);

const app = express();
app.use(express.json());
app.use(cors());

const createPaymentLinkSchema = z.object({
  productName: z.string().min(1, 'Product name is required'),
  productDescription: z.string().optional(),
  unitAmount: z.string().min(1, 'Unit amount is required').transform((val) => {
    const num = Number(val);
    if (isNaN(num) || num <= 0) {
      throw new Error('Unit amount must be a positive number');
    }
    return num;
  }),
  currency: z.string().min(1, 'Currency is required'),
  quantity: z.string().optional().default('1').transform((val) => {
    const num = Number(val);
    if (isNaN(num) || num < 1) {
      throw new Error('Quantity must be at least 1');
    }
    return num;
  }),
});

// Live endpoint
app.post('/api/v1/create-payment-link', async (req, res) => {
  try {
    const { productName, productDescription, unitAmount, currency, quantity } = createPaymentLinkSchema.parse(req.body);
    
    const product = await stripeLive.products.create({
      name: productName,
      description: productDescription,
    });
    
    const price = await stripeLive.prices.create({
      unit_amount: unitAmount,
      currency: currency,
      product: product.id,
      tax_behavior: 'exclusive',
    });

    const paymentLink = await stripeLive.paymentLinks.create({
      line_items: [{ price: price.id, quantity }],
      automatic_tax: { enabled: true },
      phone_number_collection: { enabled: true },
    });

    res.status(201).json({ paymentLinkId: paymentLink.id, url: paymentLink.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return res.status(400).json({ message: 'Validation failed', errors: formattedErrors });
    }
    console.error('Error creating payment link:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint
app.post('/api/v1/test/create-payment-link', async (req, res) => {
  try {
    const { productName, productDescription, unitAmount, currency, quantity } = createPaymentLinkSchema.parse(req.body);
    
    const product = await stripeTest.products.create({
      name: productName,
      description: productDescription,
    });
    
    const price = await stripeTest.prices.create({
      unit_amount: unitAmount,
      currency: currency,
      product: product.id,
      tax_behavior: 'exclusive',
    });

    const paymentLink = await stripeTest.paymentLinks.create({
      line_items: [{ price: price.id, quantity }],
      automatic_tax: { enabled: true },
      phone_number_collection: { enabled: true },
    });

    res.status(201).json({ paymentLinkId: paymentLink.id, url: paymentLink.url });
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      }));
      return res.status(400).json({ message: 'Validation failed', errors: formattedErrors });
    }
    console.error('Error creating payment link:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Live payments endpoint
app.get('/api/v1/successful-payments', async (req, res) => {
  try {
    const paymentIntents = await stripeLive.paymentIntents.list({
      limit: 100,
      expand: ['data.charges.data'],
    });

    const successfulPayments = paymentIntents.data.filter(intent => intent.status === 'succeeded');

    const paymentStatuses = await Promise.all(
      successfulPayments.map(async (intent) => {
        const charge = intent?.charges?.data?.[0];
        const session = await stripeLive.checkout.sessions.list({ payment_intent: intent.id });
        
        if (!session || !session.data[0]) return null;

        const sessionId = session.data[0].id;
        const sessionWithItems = await stripeLive.checkout.sessions.retrieve(sessionId, {
          expand: ['line_items'],
        });

        const buyerEmail = sessionWithItems.customer_details?.email || charge?.billing_details?.email || 'N/A';
        const buyerName = sessionWithItems.customer_details?.name || charge?.billing_details?.name || 'N/A';  
        const buyerPhone = sessionWithItems.customer_details?.phone || 'N/A';

        const itemDetails = await Promise.all(
          sessionWithItems?.line_items?.data?.map(async (item) => {
            const product = await stripeLive.products.retrieve(item.price.product);
            return {
              productName: product.name,
              quantity: item.quantity,
              productDescription: product.description || 'No description available',
            };
          }) || []
        );

        return {
          id: intent.id,
          amount: intent.amount,
          currency: intent.currency,
          status: intent.status,
          created: new Date(intent.created * 1000).toISOString(),
          buyerEmail,
          buyerName,
          buyerPhone,
          itemsBought: itemDetails,
        };
      })
    );

    res.status(200).json({ successfulPayments: paymentStatuses.filter(Boolean) });
  } catch (error) {
    console.error('Error fetching successful payments:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Test payments endpoint
app.get('/api/v1/test/successful-payments', async (req, res) => {
  try {
    const paymentIntents = await stripeTest.paymentIntents.list({
      limit: 100,
      expand: ['data.charges.data'],
    });

    const successfulPayments = paymentIntents.data.filter(intent => intent.status === 'succeeded');

    const paymentStatuses = await Promise.all(
      successfulPayments.map(async (intent) => {
        const charge = intent?.charges?.data?.[0];
        const session = await stripeTest.checkout.sessions.list({ payment_intent: intent.id });
        
        if (!session || !session.data[0]) return null;

        const sessionId = session.data[0].id;
        const sessionWithItems = await stripeTest.checkout.sessions.retrieve(sessionId, {
          expand: ['line_items'],
        });

        const buyerEmail = sessionWithItems.customer_details?.email || charge?.billing_details?.email || 'N/A';
        const buyerName = sessionWithItems.customer_details?.name || charge?.billing_details?.name || 'N/A';  
        const buyerPhone = sessionWithItems.customer_details?.phone || 'N/A';

        const itemDetails = await Promise.all(
          sessionWithItems?.line_items?.data?.map(async (item) => {
            const product = await stripeTest.products.retrieve(item.price.product);
            return {
              productName: product.name,
              quantity: item.quantity,
              productDescription: product.description || 'No description available',
            };
          }) || []
        );

        return {
          id: intent.id,
          amount: intent.amount,
          currency: intent.currency,
          status: intent.status,
          created: new Date(intent.created * 1000).toISOString(),
          buyerEmail,
          buyerName,
          buyerPhone,
          itemsBought: itemDetails,
        };
      })
    );

    res.status(200).json({ successfulPayments: paymentStatuses.filter(Boolean) });
  } catch (error) {
    console.error('Error fetching successful payments:', error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
        
