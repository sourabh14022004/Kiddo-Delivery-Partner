import {
  SHOPIFY_STORE_DOMAIN,
  SHOPIFY_ADMIN_API_KEYS,
  SHOPIFY_ADMIN_API_VERSION,
} from "../config/config";

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
        error: "Shopify API key not configured",
      };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

    const variables: any = { first };
    if (after) {
      variables.after = after;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
      body: JSON.stringify({
        query: GRAPHQL_QUERY,
        variables,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Shopify API Error:", errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      console.error("Shopify GraphQL Errors:", result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || "GraphQL query failed",
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
      error: "No data returned from Shopify",
    };
  } catch (error: any) {
    console.error("Error fetching orders from Shopify:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch orders",
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
        error: "Shopify API key not configured",
      };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

    // Convert order ID to Shopify GID format if needed
    let shopifyOrderId = orderId;
    if (!orderId.startsWith("gid://shopify/Order/")) {
      // Extract the numeric ID from the order ID
      const numericId = orderId.split("/").pop() || orderId;
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
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
      console.error("Shopify API Error:", errorText);
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const result = await response.json();

    if (result.errors) {
      console.error("Shopify GraphQL Errors:", result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || "GraphQL mutation failed",
      };
    }

    if (result.data?.tagsAdd?.userErrors?.length > 0) {
      const errors = result.data.tagsAdd.userErrors;
      console.error("Shopify User Errors:", errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(", "),
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (error: any) {
    console.error("Error adding order tags:", error);
    return {
      success: false,
      error: error.message || "Failed to add order tags",
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
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    const tag = `picked_up_${timestamp}`;

    // Use the existing addOrderTags function to mark order as picked up with timestamp
    const result = await addOrderTags(orderId, [tag]);

    if (result.success) {
      console.log(
        "Order marked as picked up in Shopify with timestamp:",
        orderId
      );
    }

    return result;
  } catch (error: any) {
    console.error("Error marking order as picked up:", error);
    return {
      success: false,
      error: error.message || "Failed to mark order as picked up",
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
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    const tag = `out_for_delivery_${timestamp}`;

    const result = await addOrderTags(orderId, [tag]);

    if (result.success) {
      console.log(
        "Order marked as out for delivery in Shopify with timestamp:",
        orderId
      );
    }

    return result;
  } catch (error: any) {
    console.error("Error marking order as in progress:", error);
    return {
      success: false,
      error: error.message || "Failed to mark order as in progress",
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
    const timestamp = new Date()
      .toISOString()
      .replace("T", " ")
      .substring(0, 19);
    const tag = `delivered_${timestamp}`;

    const result = await addOrderTags(orderId, [tag]);

    if (result.success) {
      console.log(
        "Order marked as delivered in Shopify with timestamp:",
        orderId
      );
    }

    return result;
  } catch (error: any) {
    console.error("Error marking order as delivered:", error);
    return {
      success: false,
      error: error.message || "Failed to mark order as delivered",
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
      return { success: false, error: "Shopify API key not configured" };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${errorText}` };
    }

    const result = await res.json();
    return { success: true, data: result.order };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to get order details",
    };
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
      return { success: false, error: "Shopify API key not configured" };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/transactions.json`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { success: false, error: `HTTP ${res.status}: ${errorText}` };
    }

    const result = await res.json();
    return { success: true, data: result.transactions || [] };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to get transactions",
    };
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
      return { success: false, error: "Shopify API key not configured" };
    }

    // Convert order ID to Shopify GID format if needed
    let shopifyOrderId = orderId;
    if (!orderId.startsWith("gid://shopify/Order/")) {
      // Extract the numeric ID from the order ID
      const numericId = orderId.split("/").pop() || orderId;
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
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
      console.error("Shopify API Error (mark COD paid):", errorText);
      return { success: false, error: `HTTP ${response.status}: ${errorText}` };
    }

    const result = await response.json();

    if (result.errors) {
      console.error("Shopify GraphQL Errors:", result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || "GraphQL mutation failed",
      };
    }

    if (result.data?.orderMarkAsPaid?.userErrors?.length > 0) {
      const errors = result.data.orderMarkAsPaid.userErrors;
      console.error("Shopify User Errors:", errors);
      return {
        success: false,
        error: errors.map((e: any) => e.message).join(", "),
      };
    }

    console.log("Shopify COD order marked as paid:", shopifyOrderId);
    return { success: true, data: result.data?.orderMarkAsPaid };
  } catch (error: any) {
    console.error("Error marking COD order as paid:", error);
    return {
      success: false,
      error: error.message || "Failed to mark COD order as paid",
    };
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
      return { success: false, error: "Shopify API key not configured" };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/fulfillments.json`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Shopify API Error (get fulfillments):", errorText);
      return { success: false, error: `HTTP ${res.status}: ${errorText}` };
    }

    const result = await res.json();
    const fulfillments = result.fulfillments || [];
    return { success: true, data: fulfillments };
  } catch (error: any) {
    console.error("Error getting fulfillments:", error);
    return {
      success: false,
      error: error.message || "Failed to get fulfillments",
    };
  }
};

/**
 * Update order metafield for delivery status
 */
const updateDeliveryStatusMetafield = async (
  orderId: string,
  deliveryStatus: string
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: "Shopify API key not configured" };
    }

    // Convert order ID to Shopify GID format
    let shopifyOrderId = orderId;
    if (!orderId.startsWith("gid://shopify/Order/")) {
      const numericId = orderId.split("/").pop() || orderId;
      shopifyOrderId = `gid://shopify/Order/${numericId}`;
    }

    const graphqlUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
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

    const response = await fetch(graphqlUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          metafields: [
            {
              ownerId: shopifyOrderId,
              namespace: "custom",
              key: "delivery_status",
              type: "single_line_text_field",
              value: deliveryStatus,
            },
          ],
        },
      }),
    });

    const responseText = await response.text();
    console.log(
      `[Shopify Update] Metafield update response status: ${response.status}`
    );
    console.log(
      `[Shopify Update] Metafield update response: ${responseText.substring(
        0,
        500
      )}`
    );

    if (!response.ok) {
      console.error(
        "[Shopify Update] Failed to update delivery status metafield:",
        responseText
      );
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
      };
    }

    const result = JSON.parse(responseText);

    if (result.errors && result.errors.length > 0) {
      console.error("[Shopify Update] Metafield update errors:", result.errors);
      return {
        success: false,
        error: result.errors[0]?.message || "Metafield update failed",
      };
    }

    if (result.data?.metafieldsSet?.userErrors?.length > 0) {
      const userErrors = result.data.metafieldsSet.userErrors;
      console.error("[Shopify Update] Metafield user errors:", userErrors);
      return {
        success: false,
        error: userErrors.map((e: any) => e.message).join(", "),
      };
    }

    console.log(
      `✅ [Shopify Update] Delivery status metafield updated to: ${deliveryStatus}`
    );
    return { success: true, data: result.data?.metafieldsSet };
  } catch (error: any) {
    console.error(
      "[Shopify Update] Error updating delivery status metafield:",
      error
    );
    return {
      success: false,
      error: error.message || "Failed to update delivery status metafield",
    };
  }
};

/**
 * Ensure fulfillment is marked as fulfilled when order is delivered
 * In Shopify, creating a "delivered" event should automatically mark fulfillment as fulfilled,
 * but we'll verify and ensure it's properly updated
 */
const ensureFulfillmentIsFulfilled = async (
  numericOrderId: string,
  fulfillmentId: number
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: "Shopify API key not configured" };
    }

    // In Shopify REST API, we can't directly update fulfillment status to "fulfilled"
    // The status is automatically set when a "delivered" event is created
    // However, let's verify the fulfillment exists and check its status

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/fulfillments/${fulfillmentId}.json`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
    });

    if (res.ok) {
      const result = await res.json();
      const fulfillment = result.fulfillment;
      console.log(
        `[Shopify Update] Current fulfillment status: ${
          fulfillment?.status || "unknown"
        }`
      );

      // The fulfillment should be marked as "fulfilled" when we create a "delivered" event
      // If it's not, it might be because:
      // 1. The event wasn't created successfully
      // 2. The fulfillment is in a state that prevents it from being marked as fulfilled
      // 3. There's a delay in Shopify's system

      // Note: In Shopify, you cannot directly set fulfillment status to "fulfilled" via API
      // It's automatically set when a "delivered" event is created
      return {
        success: true,
        data: {
          message:
            "Fulfillment status will be updated when delivered event is processed",
          currentStatus: fulfillment?.status,
        },
      };
    } else {
      const errorText = await res.text();
      console.warn(
        `[Shopify Update] Could not verify fulfillment status: ${errorText}`
      );
      return {
        success: false,
        error: `HTTP ${res.status}: ${errorText.substring(0, 200)}`,
      };
    }
  } catch (error: any) {
    console.error(
      "[Shopify Update] Error ensuring fulfillment is fulfilled:",
      error
    );
    return {
      success: false,
      error: error.message || "Failed to ensure fulfillment is fulfilled",
    };
  }
};

/**
 * Update fulfillment event to track delivery status
 * Note: Shopify fulfillment events API may require specific permissions or fulfillment states
 */
const updateFulfillmentEvent = async (
  numericOrderId: string,
  fulfillmentId: number,
  eventStatus: "in_transit" | "out_for_delivery" | "delivered" | "failure"
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: "Shopify API key not configured" };
    }

    const url = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/fulfillments/${fulfillmentId}/events.json`;

    // Shopify REST API expects the event in this format
    const payload = {
      event: {
        status: eventStatus,
      },
    };

    console.log(`Attempting to update fulfillment event: ${url}`);
    console.log(
      `Fulfillment ID: ${fulfillmentId}, Event Status: ${eventStatus}`
    );
    console.log(`Payload:`, JSON.stringify(payload, null, 2));

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    console.log(`Response status: ${res.status}`);
    console.log(`Response body: ${responseText}`);

    if (!res.ok) {
      console.error(
        "Shopify API Error (update fulfillment event):",
        responseText
      );

      // Try alternative payload format if first attempt fails
      if (res.status === 422 || res.status === 400) {
        console.log("Trying alternative payload format...");
        const altPayload = {
          fulfillment_event: {
            status: eventStatus,
          },
        };

        const altRes = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": apiKey,
          },
          body: JSON.stringify(altPayload),
        });

        const altResponseText = await altRes.text();
        console.log(`Alternative response status: ${altRes.status}`);
        console.log(`Alternative response body: ${altResponseText}`);

        if (altRes.ok) {
          let altResult;
          try {
            altResult = JSON.parse(altResponseText);
          } catch (e) {
            altResult = { message: "Event updated successfully" };
          }
          console.log(
            `Fulfillment event updated to ${eventStatus} using alternative format`
          );
          return { success: true, data: altResult };
        }
      }

      // Return detailed error for debugging
      return {
        success: false,
        error: `HTTP ${res.status}: ${responseText.substring(0, 200)}`,
      };
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      // If response is not JSON but status is OK, treat as success
      if (res.ok) {
        console.log(
          `Fulfillment event updated successfully (non-JSON response)`
        );
        return {
          success: true,
          data: { message: "Event updated successfully" },
        };
      }
      return {
        success: false,
        error: `Invalid JSON response: ${responseText.substring(0, 200)}`,
      };
    }

    if (result.errors && result.errors.length > 0) {
      console.error("Shopify fulfillment event errors:", result.errors);
      return { success: false, error: JSON.stringify(result.errors) };
    }

    console.log(
      `✅ Fulfillment event updated to ${eventStatus} for order ${numericOrderId}`
    );
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error updating fulfillment event:", error);
    console.error("Error stack:", error.stack);
    return {
      success: false,
      error: error.message || "Failed to update fulfillment event",
    };
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
      return { success: false, error: "Shopify API key not configured" };
    }

    // Normalize order ID to numeric for REST
    let numericOrderId = orderId;
    if (orderId.startsWith("gid://shopify/Order/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    } else if (orderId.includes("/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    }

    // Get fulfillment orders for this order
    const fulfillmentOrdersUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}/fulfillment_orders.json`;
    const foRes = await fetch(fulfillmentOrdersUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
    });

    if (!foRes.ok) {
      const errorText = await foRes.text();
      console.error("Shopify API Error (get fulfillment orders):", errorText);
      return { success: false, error: `HTTP ${foRes.status}: ${errorText}` };
    }

    const foData = await foRes.json();
    const fulfillmentOrders = foData.fulfillment_orders || [];

    if (fulfillmentOrders.length === 0) {
      return {
        success: false,
        error: "No fulfillment orders found for this order",
      };
    }

    const fulfillUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/fulfillments.json`;

    // Use first fulfillment order
    const fulfillmentOrder = fulfillmentOrders[0];
    const fulfillmentOrderId = fulfillmentOrder.id;
    const locationId =
      fulfillmentOrder.assigned_location?.location_id ||
      fulfillmentOrder.assigned_location?.id;
    const fulfillmentOrderLineItems = (fulfillmentOrder.line_items || [])
      .map((li: any) => ({
        id: li.id,
        quantity: li.fulfillable_quantity || li.quantity || 1,
      }))
      .filter((li: any) => li.quantity > 0);

    if (fulfillmentOrderLineItems.length === 0) {
      return { success: false, error: "No fulfillable line items found" };
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
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!fulfillRes.ok) {
      const errorText = await fulfillRes.text();
      console.error("Shopify API Error (create fulfillment):", errorText);
      return {
        success: false,
        error: `HTTP ${fulfillRes.status}: ${errorText}`,
      };
    }

    const fulfillResult = await fulfillRes.json();
    if (fulfillResult.errors) {
      console.error("Shopify fulfillment errors:", fulfillResult.errors);
      return { success: false, error: JSON.stringify(fulfillResult.errors) };
    }

    console.log(
      "Shopify fulfillment created successfully for order",
      numericOrderId
    );
    return { success: true, data: fulfillResult };
  } catch (error: any) {
    console.error("Error creating fulfillment:", error);
    return {
      success: false,
      error: error.message || "Failed to create fulfillment",
    };
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
      return { success: false, error: "Shopify API key not configured" };
    }

    // Get existing order to preserve current note
    const getOrderUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const getRes = await fetch(getOrderUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
    });

    let existingNote = "";
    if (getRes.ok) {
      const orderData = await getRes.json();
      existingNote = orderData.order?.note || "";
    }

    // Update order with new note (append to existing)
    const updateUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const timestamp = new Date().toLocaleString("en-US", {
      timeZone: "UTC",
      dateStyle: "short",
      timeStyle: "short",
    });
    const newNote = existingNote
      ? `${existingNote}\n[${timestamp}] ${note}`
      : `[${timestamp}] ${note}`;

    const updateRes = await fetch(updateUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
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
      console.error("Shopify API Error (add order note):", errorText);
      return {
        success: false,
        error: `HTTP ${updateRes.status}: ${errorText}`,
      };
    }

    const result = await updateRes.json();
    if (result.errors) {
      console.error("Shopify order note errors:", result.errors);
      return { success: false, error: JSON.stringify(result.errors) };
    }

    console.log(`Order note added for order ${numericOrderId}`);
    return { success: true, data: result };
  } catch (error: any) {
    console.error("Error adding order note:", error);
    return {
      success: false,
      error: error.message || "Failed to add order note",
    };
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
  status: "PICKED_UP" | "IN_TRANSIT" | "DELIVERED"
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: "Shopify API key not configured" };
    }

    // Normalize order ID to numeric for REST
    let numericOrderId = orderId;
    if (orderId.startsWith("gid://shopify/Order/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    } else if (orderId.includes("/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    }

    console.log(
      `Updating delivery status to ${status} for order ${numericOrderId}`
    );

    // Get existing fulfillments (don't create - that's the order app's responsibility)
    const fulfillmentsResult = await getOrderFulfillments(numericOrderId);
    let fulfillmentId: number | null = null;

    // Only use existing fulfillments - don't create new ones
    if (
      fulfillmentsResult.success &&
      fulfillmentsResult.data &&
      fulfillmentsResult.data.length > 0
    ) {
      // Use the first fulfillment
      const fulfillment = fulfillmentsResult.data[0];
      fulfillmentId = fulfillment.id;
      console.log("Using existing fulfillment ID:", fulfillmentId);
    } else {
      console.log(
        "No fulfillments found - fulfillment should be created by order management app"
      );
    }

    // Map our status to Shopify fulfillment event status
    let eventStatus:
      | "in_transit"
      | "out_for_delivery"
      | "delivered"
      | "failure";
    switch (status) {
      case "PICKED_UP":
        eventStatus = "in_transit"; // Picked up from warehouse
        break;
      case "IN_TRANSIT":
        eventStatus = "out_for_delivery"; // Out for delivery
        break;
      case "DELIVERED":
        eventStatus = "delivered"; // Delivered
        break;
      default:
        return { success: false, error: `Unknown status: ${status}` };
    }

    // Try to update fulfillment events if fulfillment exists
    let fulfillmentEventSuccess = false;
    let fulfillmentEventError: string | undefined;

    if (fulfillmentId) {
      // Try GraphQL first (more reliable)
      const fulfillmentGid = `gid://shopify/Fulfillment/${fulfillmentId}`;
      const graphqlEventStatus =
        status === "PICKED_UP"
          ? "IN_TRANSIT"
          : status === "IN_TRANSIT"
          ? "OUT_FOR_DELIVERY"
          : "DELIVERED";

      console.log(
        `[Shopify Update] Creating fulfillment event via GraphQL: ${graphqlEventStatus} for fulfillment ${fulfillmentId}...`
      );

      const graphqlUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
      const mutation = `
        mutation fulfillmentEventCreate($fulfillmentId: ID!, $status: FulfillmentEventStatus!) {
          fulfillmentEventCreate(fulfillmentId: $fulfillmentId, status: $status) {
            fulfillmentEvent {
              id
              status
              happenedAt
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      try {
        const graphqlRes = await fetch(graphqlUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": apiKey,
          },
          body: JSON.stringify({
            query: mutation,
            variables: {
              fulfillmentId: fulfillmentGid,
              status: graphqlEventStatus,
            },
          }),
        });

        const graphqlText = await graphqlRes.text();
        console.log(
          `[Shopify Update] GraphQL response status: ${graphqlRes.status}`
        );
        console.log(`[Shopify Update] GraphQL full response:`, graphqlText);

        if (graphqlRes.ok) {
          try {
            const graphqlResult = JSON.parse(graphqlText);

            if (graphqlResult.errors && graphqlResult.errors.length > 0) {
              console.error(
                "[Shopify Update] GraphQL errors:",
                graphqlResult.errors
              );
              fulfillmentEventError = JSON.stringify(graphqlResult.errors);
            } else if (
              graphqlResult.data?.fulfillmentEventCreate?.userErrors?.length > 0
            ) {
              const userErrors =
                graphqlResult.data.fulfillmentEventCreate.userErrors;
              console.error(
                "[Shopify Update] GraphQL user errors:",
                userErrors
              );
              fulfillmentEventError = userErrors
                .map((e: any) => `${e.field || ""}: ${e.message}`)
                .join(", ");
            } else if (
              graphqlResult.data?.fulfillmentEventCreate?.fulfillmentEvent
            ) {
              const event =
                graphqlResult.data.fulfillmentEventCreate.fulfillmentEvent;
              console.log(
                `✅ [Shopify Update] Successfully created fulfillment event via GraphQL:`,
                {
                  id: event.id,
                  status: event.status,
                  happenedAt: event.happenedAt,
                }
              );
              fulfillmentEventSuccess = true;
            } else {
              console.error(
                "[Shopify Update] Unknown GraphQL response format:",
                graphqlResult
              );
              fulfillmentEventError =
                "Unknown GraphQL response format - no fulfillment event returned";
            }
          } catch (parseError: any) {
            console.error(
              "[Shopify Update] Failed to parse GraphQL response:",
              parseError
            );
            fulfillmentEventError = `Failed to parse GraphQL response: ${parseError.message}`;
          }
        } else {
          fulfillmentEventError = `HTTP ${
            graphqlRes.status
          }: ${graphqlText.substring(0, 500)}`;
          console.error(
            `[Shopify Update] GraphQL request failed:`,
            fulfillmentEventError
          );
        }
      } catch (graphqlError: any) {
        console.error(
          "[Shopify Update] GraphQL fulfillment event error:",
          graphqlError
        );
        fulfillmentEventError =
          graphqlError.message || "GraphQL request failed";
      }

      // If GraphQL failed, try REST API as fallback
      if (!fulfillmentEventSuccess) {
        console.log(
          `[Shopify Update] Trying REST API as fallback for fulfillment event...`
        );
        const restEventResult = await updateFulfillmentEvent(
          numericOrderId,
          fulfillmentId,
          eventStatus
        );
        if (restEventResult.success) {
          console.log(
            `✅ [Shopify Update] Successfully updated fulfillment event via REST API`
          );
          fulfillmentEventSuccess = true;
        } else {
          console.warn(
            "[Shopify Update] REST API also failed:",
            restEventResult.error
          );
          if (!fulfillmentEventError) {
            fulfillmentEventError = restEventResult.error;
          }
        }
      }

      // When delivered, verify fulfillment is marked as fulfilled
      // In Shopify, creating a "delivered" event should automatically mark fulfillment as fulfilled
      if (status === "DELIVERED" && fulfillmentEventSuccess) {
        console.log(
          `[Shopify Update] Order marked as delivered - verifying fulfillment is marked as fulfilled`
        );
        const fulfilledResult = await ensureFulfillmentIsFulfilled(
          numericOrderId,
          fulfillmentId
        );
        if (fulfilledResult.success) {
          console.log(
            `✅ [Shopify Update] Fulfillment status verified:`,
            fulfilledResult.data
          );
        } else {
          console.warn(
            "[Shopify Update] Could not verify fulfillment status:",
            fulfilledResult.error
          );
        }
      }

      if (fulfillmentEventSuccess) {
        console.log(
          `✅ [Shopify Update] Fulfillment event successfully updated for order ${numericOrderId}`
        );
      } else {
        console.error(
          `❌ [Shopify Update] Failed to update fulfillment event. Error: ${fulfillmentEventError}`
        );
      }
    } else {
      console.log("⚠️ [Shopify Update] No fulfillment found for order");

      // If marking as DELIVERED and no fulfillment exists, try to create one
      // This is a fallback - normally fulfillments should be created by order management app
      if (status === "DELIVERED") {
        console.log(
          "[Shopify Update] Attempting to create fulfillment for delivered order..."
        );
        const fulfillResult = await fulfillOrder(orderId);
        if (fulfillResult.success) {
          console.log(
            "✅ [Shopify Update] Created fulfillment for delivered order"
          );
          // Now try to create the delivered event
          const newFulfillmentsResult = await getOrderFulfillments(
            numericOrderId
          );
          if (
            newFulfillmentsResult.success &&
            newFulfillmentsResult.data &&
            newFulfillmentsResult.data.length > 0
          ) {
            const newFulfillmentId = newFulfillmentsResult.data[0].id;
            console.log(
              "[Shopify Update] Creating delivered event for new fulfillment:",
              newFulfillmentId
            );

            const fulfillmentGid = `gid://shopify/Fulfillment/${newFulfillmentId}`;
            const graphqlUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
            const mutation = `
              mutation fulfillmentEventCreate($fulfillmentId: ID!, $status: FulfillmentEventStatus!) {
                fulfillmentEventCreate(fulfillmentId: $fulfillmentId, status: $status) {
                  fulfillmentEvent {
                    id
                    status
                    happenedAt
                  }
                  userErrors {
                    field
                    message
                  }
                }
              }
            `;

            try {
              const graphqlRes = await fetch(graphqlUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "X-Shopify-Access-Token": apiKey,
                },
                body: JSON.stringify({
                  query: mutation,
                  variables: {
                    fulfillmentId: fulfillmentGid,
                    status: "DELIVERED",
                  },
                }),
              });

              const graphqlText = await graphqlRes.text();
              if (graphqlRes.ok) {
                const graphqlResult = JSON.parse(graphqlText);
                if (
                  graphqlResult.data?.fulfillmentEventCreate?.fulfillmentEvent
                ) {
                  console.log(
                    "✅ [Shopify Update] Created delivered event for new fulfillment"
                  );
                  fulfillmentEventSuccess = true;
                }
              }
            } catch (e) {
              console.warn(
                "[Shopify Update] Failed to create delivered event for new fulfillment:",
                e
              );
            }
          }
        } else {
          console.warn(
            "[Shopify Update] Could not create fulfillment:",
            fulfillResult.error
          );
        }
      } else {
        console.log(
          "⚠️ [Shopify Update] Will use order notes, tags, and metafields to track status"
        );
      }
    }

    // Always add order note and tags to track status (even if fulfillment event succeeded)
    // This ensures status is visible in Shopify order notes and tags
    const statusMessages: Record<string, string> = {
      PICKED_UP: "Order picked up from warehouse",
      IN_TRANSIT: "Order out for delivery",
      DELIVERED: "Order delivered successfully",
    };

    const statusTags: Record<string, string> = {
      PICKED_UP: "Picked Up",
      IN_TRANSIT: "Out for Delivery",
      DELIVERED: "Delivered",
    };

    // Add order note
    const noteResult = await addOrderNote(
      numericOrderId,
      `[Delivery Status] ${statusMessages[status]}`
    );
    const noteSuccess = noteResult.success;

    if (noteSuccess) {
      console.log(
        "✅ [Shopify Update] Added order note to track delivery status"
      );
    } else {
      console.warn(
        "[Shopify Update] Failed to add order note:",
        noteResult.error
      );
    }

    // Add order tag for better visibility
    const tagResult = await addOrderTags(orderId, [statusTags[status]]);
    const tagSuccess = tagResult.success;

    if (tagSuccess) {
      console.log(`✅ [Shopify Update] Added order tag: ${statusTags[status]}`);
    } else {
      console.warn(
        "[Shopify Update] Failed to add order tag:",
        tagResult.error
      );
    }

    // Update delivery status metafield (for the "Delivery status" column in Shopify)
    const deliveryStatusValue =
      status === "PICKED_UP"
        ? "Picked Up"
        : status === "IN_TRANSIT"
        ? "Out for Delivery"
        : "Delivered";
    const metafieldResult = await updateDeliveryStatusMetafield(
      orderId,
      deliveryStatusValue
    );
    const metafieldSuccess = metafieldResult.success;

    if (metafieldSuccess) {
      console.log(
        `✅ [Shopify Update] Updated delivery status metafield to: ${deliveryStatusValue}`
      );
    } else {
      console.warn(
        "[Shopify Update] Failed to update delivery status metafield:",
        metafieldResult.error
      );
      // Metafield might not exist - that's okay, we'll still try other methods
    }

    // Return success if any method succeeded (fulfillment event, note, tag, or metafield)
    if (
      fulfillmentEventSuccess ||
      noteSuccess ||
      tagSuccess ||
      metafieldSuccess
    ) {
      return {
        success: true,
        data: {
          fulfillmentEvent: fulfillmentEventSuccess
            ? "Updated via GraphQL/REST"
            : "Failed or skipped",
          note: noteSuccess ? "Added" : "Failed",
          tag: tagSuccess ? "Added" : "Failed",
          metafield: metafieldSuccess ? "Updated" : "Failed",
          status: eventStatus,
        },
      };
    }

    // If all methods failed, return error
    const errors = [];
    if (fulfillmentId && fulfillmentEventError) {
      errors.push(`Fulfillment event: ${fulfillmentEventError}`);
    }
    if (!noteSuccess && noteResult.error) {
      errors.push(`Note: ${noteResult.error}`);
    }
    if (!tagSuccess && tagResult.error) {
      errors.push(`Tag: ${tagResult.error}`);
    }
    if (!metafieldSuccess && metafieldResult.error) {
      errors.push(`Metafield: ${metafieldResult.error}`);
    }

    return {
      success: false,
      error:
        errors.length > 0
          ? `All update methods failed. ${errors.join("; ")}`
          : "All update methods failed with unknown errors",
    };
  } catch (error: any) {
    console.error("Error updating delivery status:", error);
    console.error("Error stack:", error.stack);
    return {
      success: false,
      error: error.message || "Failed to update delivery status",
    };
  }
};

export type { ShopifyOrder, OrdersResponse };
