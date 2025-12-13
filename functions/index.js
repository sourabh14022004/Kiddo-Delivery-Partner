/**
 * Firebase Cloud Functions for Kiddo Delivery Partner App
 * 
 * This file contains cloud functions to:
 * 1. Detect new orders from Shopify and send notifications
 * 2. Handle Shopify webhooks for order creation
 * 
 * To deploy:
 * 1. Install Firebase CLI: npm install -g firebase-tools
 * 2. Login: firebase login
 * 3. Initialize: firebase init functions
 * 4. Deploy: firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const axios = require('axios');

admin.initializeApp();

const db = admin.firestore();
const TOKENS_COLLECTION = 'notificationTokens';
const ORDERS_COLLECTION = 'orders';
const NOTIFICATIONS_COLLECTION = 'notifications';

// Shopify Configuration (should be in environment variables)
const SHOPIFY_STORE_DOMAIN = 'kiddo-quick-baby-joy-m4bpo.myshopify.com';
const SHOPIFY_ADMIN_API_KEY = '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';
const SHOPIFY_ADMIN_API_VERSION = '2025-10';

/**
 * Helper function to get safe order ID
 */
function getSafeOrderId(shopifyOrderId) {
  if (/^\d+$/.test(shopifyOrderId)) {
    return shopifyOrderId;
  }
  const match = shopifyOrderId.match(/\/(\d+)$/);
  if (match && match[1]) {
    return match[1];
  }
  return shopifyOrderId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Fetch new orders from Shopify
 */
async function fetchNewOrders() {
  try {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
    
    const query = `
      query getOrders($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFulfillmentStatus
              displayFinancialStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              shippingAddress {
                address1
                address2
                city
                province
                zip
                country
                firstName
                lastName
                phone
              }
              lineItems(first: 10) {
                edges {
                  node {
                    id
                    title
                    quantity
                  }
                }
              }
            }
          }
        }
      }
    `;

    const response = await axios.post(
      url,
      {
        query,
        variables: { first: 20 },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_KEY,
        },
      }
    );

    if (response.data.errors) {
      console.error('Shopify GraphQL Errors:', response.data.errors);
      return [];
    }

    return response.data.data.orders.edges.map((edge) => edge.node);
  } catch (error) {
    console.error('Error fetching orders from Shopify:', error);
    return [];
  }
}

/**
 * Send push notification to all delivery partners
 */
async function sendNotificationsToAll(orderDetails) {
  try {
    // Get all notification tokens
    const tokensSnapshot = await db.collection(TOKENS_COLLECTION).get();
    
    if (tokensSnapshot.empty) {
      console.log('No notification tokens found');
      return { sentCount: 0 };
    }

    const tokens = [];
    tokensSnapshot.forEach((doc) => {
      const data = doc.data();
      tokens.push(data.token);
    });

    // Prepare notification message
    const address = orderDetails.shippingAddress?.city || 
                   orderDetails.shippingAddress?.address1 || 
                   'Location';
    const title = '📦 New Order Available!';
    const body = `${orderDetails.name} - ${orderDetails.totalPriceSet?.shopMoney?.amount || '0'} ${orderDetails.totalPriceSet?.shopMoney?.currencyCode || 'USD'} to ${address}`;

    // Send notifications using Expo Push Notification API
    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: {
        orderId: orderDetails.id,
        orderName: orderDetails.name,
        type: 'new_order',
      },
      badge: 1,
    }));

    const response = await axios.post(
      'https://exp.host/--/api/v2/push/send',
      messages,
      {
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
      }
    );

    const sentCount = Array.isArray(response.data.data) ? response.data.data.length : 0;

    // Save notification record
    await db.collection(NOTIFICATIONS_COLLECTION).add({
      orderId: orderDetails.id,
      orderName: orderDetails.name,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      sentCount,
      totalTokens: tokens.length,
    });

    console.log(`Sent ${sentCount} notifications for order ${orderDetails.id}`);
    return { sentCount };
  } catch (error) {
    console.error('Error sending notifications:', error);
    return { sentCount: 0, error: error.message };
  }
}

/**
 * Cloud Function: Check for new orders periodically
 * This function runs on a schedule (every 5 minutes) to check for new orders
 */
exports.checkNewOrders = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    console.log('Checking for new orders...');
    
    try {
      const orders = await fetchNewOrders();
      let newOrdersCount = 0;

      for (const order of orders) {
        // Skip fulfilled/delivered orders
        if (
          order.displayFulfillmentStatus === 'FULFILLED' ||
          order.displayFulfillmentStatus === 'DELIVERED'
        ) {
          continue;
        }

        const safeOrderId = getSafeOrderId(order.id);
        const orderRef = db.collection(ORDERS_COLLECTION).doc(safeOrderId);
        const orderDoc = await orderRef.get();

        // If order doesn't exist in Firestore, it's a new order
        if (!orderDoc.exists()) {
          // Sync order to Firestore
          await orderRef.set({
            shopifyOrderId: order.id,
            shopifyOrderName: order.name,
            createdAt: order.createdAt,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'PENDING',
            assignedTo: null,
            shopifyData: {
              displayFulfillmentStatus: order.displayFulfillmentStatus,
              displayFinancialStatus: order.displayFinancialStatus,
              totalPrice: order.totalPriceSet,
              shippingAddress: order.shippingAddress,
              lineItems: order.lineItems,
            },
          }, { merge: true });

          // Send notifications to all delivery partners
          await sendNotificationsToAll(order);
          newOrdersCount++;
        }
      }

      console.log(`Found ${newOrdersCount} new orders`);
      return null;
    } catch (error) {
      console.error('Error in checkNewOrders:', error);
      return null;
    }
  });

/**
 * Cloud Function: Handle Shopify webhook for order creation
 * Set this up in Shopify Admin: Settings > Notifications > Webhooks
 * URL: https://YOUR_REGION-YOUR_PROJECT.cloudfunctions.net/shopifyOrderWebhook
 * Event: Order creation
 */
exports.shopifyOrderWebhook = functions.https.onRequest(async (req, res) => {
  // Verify webhook (add HMAC verification in production)
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    const order = req.body;
    
    // Skip fulfilled/delivered orders
    if (
      order.fulfillment_status === 'fulfilled' ||
      order.fulfillment_status === 'delivered'
    ) {
      res.status(200).send('Order already fulfilled');
      return;
    }

    const safeOrderId = getSafeOrderId(order.id.toString());
    const orderRef = db.collection(ORDERS_COLLECTION).doc(safeOrderId);
    const orderDoc = await orderRef.get();

    // If order doesn't exist, it's new
    if (!orderDoc.exists()) {
      // Sync order to Firestore
      await orderRef.set({
        shopifyOrderId: `gid://shopify/Order/${order.id}`,
        shopifyOrderName: order.name,
        createdAt: order.created_at,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'PENDING',
        assignedTo: null,
        shopifyData: {
          displayFulfillmentStatus: order.fulfillment_status?.toUpperCase() || 'UNFULFILLED',
          displayFinancialStatus: order.financial_status?.toUpperCase() || 'PENDING',
          totalPrice: {
            shopMoney: {
              amount: order.total_price,
              currencyCode: order.currency,
            },
          },
          shippingAddress: order.shipping_address,
          lineItems: order.line_items,
        },
      }, { merge: true });

      // Send notifications
      await sendNotificationsToAll({
        id: `gid://shopify/Order/${order.id}`,
        name: order.name,
        totalPriceSet: {
          shopMoney: {
            amount: order.total_price,
            currencyCode: order.currency,
          },
        },
        shippingAddress: order.shipping_address || {},
      });

      console.log(`New order received via webhook: ${order.id}`);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling Shopify webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});

