
const SHOPIFY_STORE_DOMAIN = 'kiddo-quick-baby-joy-m4bpo.myshopify.com';
const SHOPIFY_ADMIN_API_KEY = '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'; // Using the active key from config
const SHOPIFY_ADMIN_API_VERSION = '2025-10';

async function main() {
    console.log('--- Debugging Shopify Delivery Status Sync ---');

    // 1. Fetch recent orders to find one to test
    console.log('\n1. Fetching recent orders...');
    const orders = await fetchOrders();

    if (orders.length === 0) {
        console.error('No orders found.');
        return;
    }

    // Log details of recent orders
    console.log(`Found ${orders.length} orders. Showing details:`);
    for (const order of orders) {
        console.log(`\nOrder: ${order.name} (ID: ${order.id})`);
        console.log(`Created At: ${order.createdAt}`);
        console.log(`Tags: ${JSON.stringify(order.tags)}`);

        // Check current metafield value
        const metafield = await getMetafield(order.id);
        console.log(`Current Delivery Status Metafield: ${JSON.stringify(metafield)}`);

        // Check note attributes (custom attributes)
        // Note: We'd need a separate REST call for this, but let's focus on Metafield first as that's what user asked for.
    }

    // 2. Attempt to update the most recent order
    const testOrder = orders[0];
    console.log(`\n2. Attempting to update order ${testOrder.name} to 'Debug Test Status'`);

    const result = await updateMetafield(testOrder.id, "Debug Test Status");
    console.log('Update Result:', JSON.stringify(result, null, 2));

    // 3. Verify update
    console.log('\n3. Verifying update...');
    const updatedMetafield = await getMetafield(testOrder.id);
    console.log(`New Delivery Status Metafield: ${JSON.stringify(updatedMetafield)}`);
}

async function fetchOrders() {
    const query = `
    query {
      orders(first: 5, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            tags
            metafield(namespace: "custom", key: "delivery_status") {
              value
            }
          }
        }
      }
    }
  `;

    const response = await fetchGraphQL(query);
    if (response.errors) {
        console.error('Fetch Orders Errors:', response.errors);
        return [];
    }
    return response.data.orders.edges.map(edge => edge.node);
}

async function getMetafield(orderId) {
    const query = `
    query getMetafield($id: ID!) {
      order(id: $id) {
        metafield(namespace: "custom", key: "delivery_status") {
          id
          value
          key
        }
      }
    }
  `;

    const response = await fetchGraphQL(query, { id: orderId });
    return response.data?.order?.metafield || null;
}

async function updateMetafield(orderId, value) {
    // Try metafieldsSet first
    const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          key
          value
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

    const variables = {
        metafields: [
            {
                ownerId: orderId,
                namespace: "custom",
                key: "delivery_status",
                type: "single_line_text_field",
                value: value
            }
        ]
    };

    const response = await fetchGraphQL(mutation, variables);
    return response;
}

async function fetchGraphQL(query, variables = {}) {
    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': SHOPIFY_ADMIN_API_KEY
            },
            body: JSON.stringify({ query, variables })
        });

        if (!res.ok) {
            console.error(`HTTP Error: ${res.status} ${res.statusText}`);
            console.error(await res.text());
            return { errors: [{ message: `HTTP ${res.status}` }] };
        }

        return await res.json();
    } catch (err) {
        console.error('Network Error:', err);
        return { errors: [{ message: err.message }] };
    }
}

main().catch(console.error);
