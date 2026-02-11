
const SHOPIFY_STORE_DOMAIN = 'kiddo-quick-baby-joy-m4bpo.myshopify.com';
const SHOPIFY_ADMIN_API_KEY = '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';
const SHOPIFY_ADMIN_API_VERSION = '2025-10';

async function main() {
    console.log('--- Checking Shopify API Permissions ---');

    // 1. Check Order Read Access
    console.log('\n[1/3] Checking Order Read Access (read_orders)...');
    const orders = await fetchGraphQL(`
    query {
      orders(first: 1) {
        edges { node { id name } }
      }
    }
  `);

    if (orders.errors) {
        console.error('❌ Failed to read orders:', JSON.stringify(orders.errors));
    } else {
        console.log('✅ Order read access confirmed.');
        if (orders.data.orders.edges.length > 0) {
            const orderId = orders.data.orders.edges[0].node.id;
            const orderName = orders.data.orders.edges[0].node.name;
            console.log(`   Ref Order: ${orderName} (${orderId})`);

            // 2. Check Metafield Write Access
            console.log('\n[2/3] Checking Metafield Write Access (write_orders)...');
            await checkMetafieldAccess(orderId);

            // 3. Check Fulfillment Order Access
            console.log('\n[3/3] Checking Fulfillment Order Access (read_merchant_managed_fulfillment_orders)...');
            await checkFulfillmentOrderAccess(orderId);
        } else {
            console.warn('⚠️ No orders found to test other permissions.');
        }
    }
}

async function checkMetafieldAccess(orderId) {
    // Try to update a dummy metafield
    const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key value }
        userErrors { field message }
      }
    }
  `;

    const response = await fetchGraphQL(mutation, {
        metafields: [
            {
                ownerId: orderId,
                namespace: "custom",
                key: "debug_permission_check",
                type: "single_line_text_field",
                value: "ok"
            }
        ]
    });

    if (response.errors) {
        // Check for specific permission error
        const isPermissionError = JSON.stringify(response.errors).includes("access denied");
        if (isPermissionError) {
            console.error('❌ Metafield write access DENIED. Missing `write_orders` scope?');
        } else {
            console.error('❌ Metafield update failed:', JSON.stringify(response.errors));
        }
    } else if (response.data?.metafieldsSet?.userErrors?.length > 0) {
        console.error('❌ Metafield user errors:', JSON.stringify(response.data.metafieldsSet.userErrors));
    } else {
        console.log('✅ Metafield write access confirmed.');
    }
}

async function checkFulfillmentOrderAccess(orderId) {
    // Need to convert GID to numeric ID for REST check or use GraphQL
    // Let's use GraphQL for FulfillmentOrders
    const query = `
    query getFulfillmentOrders($id: ID!) {
      order(id: $id) {
        fulfillmentOrders(first: 1) {
          edges { node { id status } }
        }
      }
    }
    `;

    const response = await fetchGraphQL(query, { id: orderId });

    if (response.errors) {
        const errorStr = JSON.stringify(response.errors);
        if (errorStr.includes("access denied") || errorStr.includes("permission")) {
            console.error('❌ Fulfillment Order access DENIED.');
            console.error('   REQUIRED SCOPES: `read_merchant_managed_fulfillment_orders`, `write_merchant_managed_fulfillment_orders`');
            console.error('   Also check: `read_assigned_fulfillment_orders`');
        } else {
            console.error('❌ Fulfillment Order fetch failed:', errorStr);
        }
    } else {
        console.log('✅ Fulfillment Order access confirmed.');
    }
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
        return await res.json();
    } catch (err) {
        return { errors: [{ message: err.message }] };
    }
}

main();
