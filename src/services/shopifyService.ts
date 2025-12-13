import {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ADMIN_API_KEYS,
  SHOPIFY_ADMIN_API_VERSION,
} from '../config/config';

interface ShopifyResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface ShopifyOrder {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  totalPriceSet: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  shippingAddress: {
    address1: string;
    address2?: string;
    city: string;
    province: string;
    zip: string;
    country: string;
    firstName: string;
    lastName: string;
    phone?: string;
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        id: string;
        title: string;
        quantity: number;
        sku?: string;
        vendor?: string;
        originalUnitPriceSet: {
          shopMoney: {
            amount: string;
            currencyCode: string;
          };
        };
        originalTotalSet: {
          shopMoney: {
            amount: string;
            currencyCode: string;
          };
        };
      };
    }>;
  };
}

interface OrdersResponse {
  orders: {
    edges: Array<{
      node: ShopifyOrder;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string;
    };
  };
}

const GRAPHQL_QUERY = `
  query getOrders($first: Int!, $after: String) {
    orders(first: $first, after: $after, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          updatedAt
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
                sku
                vendor
                originalUnitPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
                originalTotalSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const fetchOrders = async (
  first: number = 20,
  after?: string
): Promise<ShopifyResponse<OrdersResponse>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0]; // Use first API key
    if (!apiKey) {
      return {
        success: false,
        error: 'Shopify API key not configured',
      };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

    const variables: any = { first };
    if (after) {
      variables.after = after;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
      body: JSON.stringify({
        query: GRAPHQL_QUERY,
        variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API Error:', errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      console.error('Shopify GraphQL Errors:', result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || 'GraphQL query failed',
      };
    }

    if (result.data) {
      return {
        success: true,
        data: result.data,
      };
    }

    return {
      success: false,
      error: 'No data returned from Shopify',
    };
  } catch (error: any) {
    console.error('Error fetching orders from Shopify:', error);
    return {
      success: false,
      error: error.message || 'Failed to fetch orders',
    };
  }
};

/**
 * Add tags to a Shopify order
 */
export const addOrderTags = async (
  orderId: string,
  tags: string[]
): Promise<ShopifyResponse<{ tagsAdd: { userErrors: any[] } }>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return {
        success: false,
        error: 'Shopify API key not configured',
      };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

    // Convert order ID to Shopify GID format if needed
    let shopifyOrderId = orderId;
    if (!orderId.startsWith('gid://shopify/Order/')) {
      // Extract the numeric ID from the order ID
      const numericId = orderId.split('/').pop() || orderId;
      shopifyOrderId = `gid://shopify/Order/${numericId}`;
    }

    const mutation = `
      mutation tagsAdd($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          id: shopifyOrderId,
          tags: tags,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API Error:', errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      console.error('Shopify GraphQL Errors:', result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || 'GraphQL mutation failed',
      };
    }

    if (result.data?.tagsAdd?.userErrors?.length > 0) {
      const errors = result.data.tagsAdd.userErrors;
      console.error('Shopify User Errors:', errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(', '),
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error('Error adding order tags:', error);
    return {
      success: false,
      error: error.message || 'Failed to add order tags',
    };
  }
};

/**
 * Mark order as picked up in Shopify by adding a tag with timestamp
 */
export const markOrderAsPickedUp = async (
  orderId: string
): Promise<ShopifyResponse<{ tagsAdd: { userErrors: any[] } }>> => {
  try {
    // Create timestamp in readable format
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const tag = `picked_up_${timestamp}`;
    
    // Use the existing addOrderTags function to mark order as picked up with timestamp
    const result = await addOrderTags(orderId, [tag]);
    
    if (result.success) {
      console.log('Order marked as picked up in Shopify with timestamp:', orderId);
    }
    
    return result;
  } catch (error: any) {
    console.error('Error marking order as picked up:', error);
    return {
      success: false,
      error: error.message || 'Failed to mark order as picked up',
    };
  }
};

/**
 * Mark order as in progress (Out for Delivery) in Shopify by adding a tag with timestamp
 */
export const markOrderAsInProgress = async (
  orderId: string
): Promise<ShopifyResponse<{ tagsAdd: { userErrors: any[] } }>> => {
  try {
    // Create timestamp in readable format
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const tag = `out_for_delivery_${timestamp}`;
    
    const result = await addOrderTags(orderId, [tag]);

    if (result.success) {
      console.log('Order marked as out for delivery in Shopify with timestamp:', orderId);
    }

    return result;
  } catch (error: any) {
    console.error('Error marking order as in progress:', error);
    return {
      success: false,
      error: error.message || 'Failed to mark order as in progress',
    };
  }
};

/**
 * Mark order as delivered in Shopify by adding a tag with timestamp
 */
export const markOrderAsDelivered = async (
  orderId: string
): Promise<ShopifyResponse<{ tagsAdd: { userErrors: any[] } }>> => {
  try {
    // Create timestamp in readable format
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const tag = `delivered_${timestamp}`;
    
    const result = await addOrderTags(orderId, [tag]);

    if (result.success) {
      console.log('Order marked as delivered in Shopify with timestamp:', orderId);
    }

    return result;
  } catch (error: any) {
    console.error('Error marking order as delivered:', error);
    return {
      success: false,
      error: error.message || 'Failed to mark order as delivered',
    };
  }
};

/**
 * Get order details including financial status and transactions
 */
const getOrderDetails = async (
  numericOrderId: string
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${errorText}` };
    }

    const result = await res.json();
    return { success: true, data: result.order };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get order details' };
  }
};

/**
 * Get existing transactions for an order
 */
const getOrderTransactions = async (
  numericOrderId: string
): Promise<ShopifyResponse<any[]>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/transactions.json`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${errorText}` };
    }

    const result = await res.json();
    return { success: true, data: result.transactions || [] };
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to get transactions' };
  }
};

/**
 * Mark a COD order as paid using GraphQL orderMarkAsPaid mutation
 * This updates the payment status without creating transactions
 */
export const markCodOrderAsPaid = async (
  orderId: string
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    // Convert order ID to Shopify GID format if needed
    let shopifyOrderId = orderId;
    if (!orderId.startsWith('gid://shopify/Order/')) {
      // Extract the numeric ID from the order ID
      const numericId = orderId.split('/').pop() || orderId;
      shopifyOrderId = `gid://shopify/Order/${numericId}`;
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

    // Use GraphQL orderMarkAsPaid mutation
    const mutation = `
      mutation orderMarkAsPaid($input: OrderMarkAsPaidInput!) {
        orderMarkAsPaid(input: $input) {
          order {
            id
            name
            displayFinancialStatus
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            id: shopifyOrderId,
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Shopify API Error (mark COD paid):', errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();

    if (result.errors) {
      console.error('Shopify GraphQL Errors:', result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || 'GraphQL mutation failed',
      };
    }

    if (result.data?.orderMarkAsPaid?.userErrors?.length > 0) {
      const errors = result.data.orderMarkAsPaid.userErrors;
      console.error('Shopify User Errors:', errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(', '),
      };
    }

    console.log('Shopify COD order marked as paid:', shopifyOrderId);
    return { success: true, data: result.data?.orderMarkAsPaid };
  } catch (error: any) {
    console.error('Error marking COD order as paid:', error);
    return { success: false, error: error.message || 'Failed to mark COD order as paid' };
  }
};

/**
 * Get existing fulfillments for an order
 */
const getOrderFulfillments = async (
  numericOrderId: string
): Promise<ShopifyResponse<any[]>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/fulfillments.json`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Shopify API Error (get fulfillments):', errorText);
      return { success: false, error: `HTTP ${res.status}: ${errorText}` };
    }

    const result = await res.json();
    const fulfillments = result.fulfillments || [];
    return { success: true, data: fulfillments };
  } catch (error: any) {
    console.error('Error getting fulfillments:', error);
    return { success: false, error: error.message || 'Failed to get fulfillments' };
  }
};

/**
 * Update fulfillment event to track delivery status
 * Note: Shopify fulfillment events API may require specific permissions or fulfillment states
 */
const updateFulfillmentEvent = async (
  numericOrderId: string,
  fulfillmentId: number,
  eventStatus: 'in_transit' | 'out_for_delivery' | 'delivered' | 'failure'
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/fulfillments/${fulfillmentId}/events.json`;
    
    // Try different payload formats based on Shopify API requirements
    let payload: any = {
      event: {
        status: eventStatus,
      },
    };

    console.log(`Attempting to update fulfillment event: ${url}`);
    console.log(`Payload:`, JSON.stringify(payload, null, 2));

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log(`Response status: ${res.status}`);
    console.log(`Response body: ${responseText}`);

    if (!res.ok) {
      console.error('Shopify API Error (update fulfillment event):', responseText);
      
      // Try alternative payload format if first attempt fails
      if (res.status === 422 || res.status === 400) {
        console.log('Trying alternative payload format...');
        const altPayload = {
          fulfillment_event: {
            status: eventStatus,
          },
        };
        
        const altRes = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': apiKey,
          },
          body: JSON.stringify(altPayload),
        });
        
        const altResponseText = await altRes.text();
        console.log(`Alternative response status: ${altRes.status}`);
        console.log(`Alternative response body: ${altResponseText}`);
        
        if (altRes.ok) {
          const altResult = JSON.parse(altResponseText);
          console.log(`Fulfillment event updated to ${eventStatus} using alternative format`);
          return { success: true, data: altResult };
        }
      }
      
      return { success: false, error: `HTTP ${res.status}: ${responseText}` };
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      // If response is not JSON, treat as success if status is OK
      if (res.ok) {
        return { success: true, data: { message: 'Event updated successfully' } };
      }
      return { success: false, error: `Invalid JSON response: ${responseText}` };
    }

    if (result.errors) {
      console.error('Shopify fulfillment event errors:', result.errors);
      return { success: false, error: JSON.stringify(result.errors) };
    }

    console.log(`Fulfillment event updated to ${eventStatus} for order ${numericOrderId}`);
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error updating fulfillment event:', error);
    console.error('Error stack:', error.stack);
    return { success: false, error: error.message || 'Failed to update fulfillment event' };
  }
};

/**
 * Create a fulfillment to mark the order as fulfilled in Shopify
 */
export const fulfillOrder = async (
  orderId: string
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    // Normalize order ID to numeric for REST
    let numericOrderId = orderId;
    if (orderId.startsWith('gid://shopify/Order/')) {
      numericOrderId = orderId.split('/').pop() || orderId;
    } else if (orderId.includes('/')) {
      numericOrderId = orderId.split('/').pop() || orderId;
    }

    // Get fulfillment orders for this order
    const fulfillmentOrdersUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/fulfillment_orders.json`;
    const foRes = await fetch(fulfillmentOrdersUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
    });

    if (!foRes.ok) {
      const errorText = await foRes.text();
      console.error('Shopify API Error (get fulfillment orders):', errorText);
      return { success: false, error: `HTTP ${foRes.status}: ${errorText}` };
    }

    const foData = await foRes.json();
    const fulfillmentOrders = foData.fulfillment_orders || [];

    if (fulfillmentOrders.length === 0) {
      return { success: false, error: 'No fulfillment orders found for this order' };
    }

    const fulfillUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/fulfillments.json`;

    // Use first fulfillment order
    const fulfillmentOrder = fulfillmentOrders[0];
    const fulfillmentOrderId = fulfillmentOrder.id;
    const locationId = fulfillmentOrder.assigned_location?.location_id || fulfillmentOrder.assigned_location?.id;
    const fulfillmentOrderLineItems = (fulfillmentOrder.line_items || [])
      .map((li: any) => ({
        id: li.id,
        quantity: li.fulfillable_quantity || li.quantity || 1,
      }))
      .filter((li: any) => li.quantity > 0);

    if (fulfillmentOrderLineItems.length === 0) {
      return { success: false, error: 'No fulfillable line items found' };
    }

    const payload = {
      fulfillment: {
        notify_customer: false,
        location_id: locationId || undefined,
        line_items_by_fulfillment_order: [
          {
            fulfillment_order_id: fulfillmentOrderId,
            fulfillment_order_line_items: fulfillmentOrderLineItems,
          },
        ],
      },
    };

    const fulfillRes = await fetch(fulfillUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!fulfillRes.ok) {
      const errorText = await fulfillRes.text();
      console.error('Shopify API Error (create fulfillment):', errorText);
      return { success: false, error: `HTTP ${fulfillRes.status}: ${errorText}` };
    }

    const fulfillResult = await fulfillRes.json();
    if (fulfillResult.errors) {
      console.error('Shopify fulfillment errors:', fulfillResult.errors);
      return { success: false, error: JSON.stringify(fulfillResult.errors) };
    }

    console.log('Shopify fulfillment created successfully for order', numericOrderId);
    return { success: true, data: fulfillResult };
  } catch (error: any) {
    console.error('Error creating fulfillment:', error);
    return { success: false, error: error.message || 'Failed to create fulfillment' };
  }
};

/**
 * Add a note to a Shopify order (visible in merchant app)
 */
const addOrderNote = async (
  numericOrderId: string,
  note: string
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    // Get existing order to preserve current note
    const getOrderUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const getRes = await fetch(getOrderUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
    });

    let existingNote = '';
    if (getRes.ok) {
      const orderData = await getRes.json();
      existingNote = orderData.order?.note || '';
    }

    // Update order with new note (append to existing)
    const updateUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const timestamp = new Date().toLocaleString('en-US', { 
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short'
    });
    const newNote = existingNote 
      ? `${existingNote}\n[${timestamp}] ${note}`
      : `[${timestamp}] ${note}`;

    const updateRes = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': apiKey,
      },
      body: JSON.stringify({
        order: {
          id: numericOrderId,
          note: newNote,
        },
      }),
    });

    if (!updateRes.ok) {
      const errorText = await updateRes.text();
      console.error('Shopify API Error (add order note):', errorText);
      return { success: false, error: `HTTP ${updateRes.status}: ${errorText}` };
    }

    const result = await updateRes.json();
    if (result.errors) {
      console.error('Shopify order note errors:', result.errors);
      return { success: false, error: JSON.stringify(result.errors) };
    }

    console.log(`Order note added for order ${numericOrderId}`);
    return { success: true, data: result };
  } catch (error: any) {
    console.error('Error adding order note:', error);
    return { success: false, error: error.message || 'Failed to add order note' };
  }
};

/**
 * Update delivery status in Shopify using fulfillment events
 * PICKED_UP -> in_transit (picked up)
 * IN_TRANSIT -> out_for_delivery (out for delivery)
 * DELIVERED -> delivered (delivered)
 */
export const updateDeliveryStatus = async (
  orderId: string,
  status: 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED'
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: 'Shopify API key not configured' };
    }

    // Normalize order ID to numeric for REST
    let numericOrderId = orderId;
    if (orderId.startsWith('gid://shopify/Order/')) {
      numericOrderId = orderId.split('/').pop() || orderId;
    } else if (orderId.includes('/')) {
      numericOrderId = orderId.split('/').pop() || orderId;
    }

    console.log(`Updating delivery status to ${status} for order ${numericOrderId}`);

    // Get existing fulfillments (don't create - that's the order app's responsibility)
    const fulfillmentsResult = await getOrderFulfillments(numericOrderId);
    let fulfillmentId: number | null = null;

    // Only use existing fulfillments - don't create new ones
    if (fulfillmentsResult.success && fulfillmentsResult.data && fulfillmentsResult.data.length > 0) {
      // Use the first fulfillment
      const fulfillment = fulfillmentsResult.data[0];
      fulfillmentId = fulfillment.id;
      console.log('Using existing fulfillment ID:', fulfillmentId);
    } else {
      console.log('No fulfillments found - fulfillment should be created by order management app');
    }

    // Map our status to Shopify fulfillment event status
    let eventStatus: 'in_transit' | 'out_for_delivery' | 'delivered' | 'failure';
    switch (status) {
      case 'PICKED_UP':
        eventStatus = 'in_transit'; // Picked up from warehouse
        break;
      case 'IN_TRANSIT':
        eventStatus = 'out_for_delivery'; // Out for delivery
        break;
      case 'DELIVERED':
        eventStatus = 'delivered'; // Delivered
        break;
      default:
        return { success: false, error: `Unknown status: ${status}` };
    }

    // Only update fulfillment events if fulfillment exists
    if (fulfillmentId) {
      console.log(`Updating fulfillment event to ${eventStatus}...`);

      // Update the fulfillment event
      const fulfillmentEventResult = await updateFulfillmentEvent(numericOrderId, fulfillmentId, eventStatus);

      if (fulfillmentEventResult.success) {
        console.log(`Successfully updated delivery status to ${eventStatus}`);
        return { 
          success: true, 
          data: {
            fulfillmentEvent: fulfillmentEventResult.data,
            status: eventStatus,
          }
        };
      }

      console.error('Failed to update fulfillment event:', fulfillmentEventResult.error);
    }
    
    // If no fulfillment exists or fulfillment event update fails, add a note as fallback
    const statusMessages: Record<string, string> = {
      'PICKED_UP': 'Order picked up from warehouse',
      'IN_TRANSIT': 'Order out for delivery',
      'DELIVERED': 'Order delivered successfully',
    };
    
    const noteResult = await addOrderNote(numericOrderId, `[Delivery Status] ${statusMessages[status]}`);
    if (noteResult.success) {
      console.log('Added order note as fallback');
      return {
        success: true,
        data: {
          note: noteResult.data,
          warning: 'Fulfillment event update failed, but note was added',
        }
      };
    }

    return fulfillmentEventResult;
  } catch (error: any) {
    console.error('Error updating delivery status:', error);
    console.error('Error stack:', error.stack);
    return { success: false, error: error.message || 'Failed to update delivery status' };
  }
};

export type { ShopifyOrder, OrdersResponse };

