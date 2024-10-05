import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import cors from 'cors';

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'My API',
      version: '1.0.0',
      description: 'API documentation for my Express app',
    },
    servers: [
      {
        url: 'http://localhost:3000',
      },
      {
        url: 'https://auto-gen-payment-link-stripe.vercel.app/',
      },
    ],
  },
  apis: ['./*.js'], // Adjusted path to include all JS files in the current directory
};

const swaggerDocs = swaggerJSDoc(swaggerOptions);

const app = express();
app.use(cors()); 
app.use(express.json());
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @swagger
 * /api/v1/create-payment-link:
 *   post:
 *     summary: Create a payment link
 *     description: Creates a payment link for a product.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productName:
 *                 type: string
 *                 example: "Product Name"
 *               unitAmount:
 *                 type: integer
 *                 example: 1000
 *               currency:
 *                 type: string
 *                 example: "usd"
 *               quantity:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       201:
 *         description: Payment link created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentLinkId:
 *                   type: string
 *                   example: "link_1JyIuD2eZvKYlo2CzJ4M1n7G"
 *                 url:
 *                   type: string
 *                   example: "https://paymentlink.com"
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error message"
 */
app.post('/api/v1/create-payment-link', async (req, res) => {
  try {
    const { productName, unitAmount, currency, quantity } = req.body;
    const product = await stripe.products.create({
      name: productName,
    });
    const price = await stripe.prices.create({
      unit_amount: unitAmount,
      currency: currency,
      product: product.id,
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

/**
 * @swagger
 * /api/v1/successful-payments:
 *   get:
 *     summary: Retrieve successful payments
 *     description: Fetches a list of successful payments made through Stripe.
 *     responses:
 *       200:
 *         description: A list of successful payments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 successfulPayments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         example: "pi_3Q6fbZEM4mSGBUuf1t8CT5wX"
 *                       amount:
 *                         type: integer
 *                         example: 107700
 *                       currency:
 *                         type: string
 *                         example: "usd"
 *                       status:
 *                         type: string
 *                         example: "succeeded"
 *                       created:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-10-05T21:33:37.000Z"
 *                       buyerEmail:
 *                         type: string
 *                         example: "buyer@example.com"
 *                       buyerName:
 *                         type: string
 *                         example: "John Doe"
 *                       itemsBought:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             productName:
 *                               type: string
 *                               example: "Product Name"
 *                             quantity:
 *                               type: integer
 *                               example: 1
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: "Error message"
 */
app.get('/api/v1/successful-payments', async (req, res) => {
  try {
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 100,
      expand: ['data.charges.data'],
    });

    const successfulPayments = paymentIntents.data.filter(
      (intent) => intent.status === 'succeeded'
    );

    const paymentStatuses = await Promise.all(successfulPayments.map(async (intent) => {
      const charge = intent?.charges?.data?.[0];
      const session = await stripe.checkout.sessions.list({
        payment_intent: intent.id,
      });
      const sessionId = session?.data?.[0]?.id;
      const sessionWithItems = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['line_items'],
      });

      const itemDetails = sessionWithItems?.line_items?.data?.map((item) => ({
        productName: item.description,
        quantity: item.quantity,
      })) || [];

      return {
        id: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        status: intent.status,
        created: new Date(intent.created * 1000).toISOString(),
        buyerEmail: charge?.billing_details?.email || 'N/A',
        buyerName: charge?.billing_details?.name || 'N/A',
        itemsBought: itemDetails,
      };
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
