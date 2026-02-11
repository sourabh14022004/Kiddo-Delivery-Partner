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
  cancelledAt?: string | null;
  displayFulfillmentStatus: string;
  displayFinancialStatus: string;
  tags?: string[];
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
          cancelledAt
          displayFulfillmentStatus
          displayFinancialStatus
          tags
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

/**
 * Helper to fetch with retry for 429 rate limits
 */
const fetchWithRetry = async (url: string, options: RequestInit, retries = 3, backoff = 500): Promise<Response> => {
  try {
    const response = await fetch(url, options);

    if (response.status === 429 && retries > 0) {
      const waitTime = backoff * (4 - retries); // 500, 1000, 1500
      console.warn(`[Shopify API] Rate limited (429), retrying in ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return fetchWithRetry(url, options, retries - 1, backoff);
    }

    return response;
  } catch (err) {
    if (retries > 0) {
      const waitTime = backoff * (4 - retries);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return fetchWithRetry(url, options, retries - 1, backoff);
    }
    throw err;
  }
};

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
      // Background sync: Check each order's tags and sync delivery status if needed
      // This runs asynchronously and doesn't block the response
      const orders = result.data.orders?.edges || [];
      orders.forEach((edge: any) => {
        const order = edge.node;
        if (order?.tags && Array.isArray(order.tags) && order.tags.length > 0) {
          // Check if tags contain delivery status
          const deliveryStatus = extractDeliveryStatusFromTags(order.tags);
          if (deliveryStatus) {
            // Sync delivery status from tags to Delivery status column
            // This will update both metafield and custom attribute
            // Run in background without blocking the response
            syncDeliveryStatusFromTags(order.id, order.tags).catch((err) => {
              // Silent fail - this is background sync
              console.warn(
                `[Background Sync] Failed to sync delivery status for order ${order.id}:`,
                err
              );
            });
          }
        }
      });

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
 * Extract delivery status from tags
 * Looks for tags like "Picked Up", "Out for Delivery", "Delivered", etc.
 */
const extractDeliveryStatusFromTags = (tags: string[]): string | null => {
  const statusMap: Record<string, string> = {
    "picked up": "Picked Up",
    "out for delivery": "Out for Delivery",
    "in progress": "In progress",
    "in transit": "In progress",
    "delivered": "Delivered",
  };

  for (const tag of tags) {
    const normalizedTag = tag.toLowerCase().trim();
    if (statusMap[normalizedTag]) return statusMap[normalizedTag];
    if (normalizedTag.includes("out for delivery")) return "Out for Delivery";
    if (normalizedTag.includes("picked up")) return "Picked Up";
    if (normalizedTag.includes("in progress") || normalizedTag.includes("in transit")) return "In progress";
    if (normalizedTag.includes("delivered")) return "Delivered";
  }

  return null;
};

/**
 * Sync delivery status from tags to Delivery status column
 * This ensures the Delivery status column is populated when tags contain status info
 */
const syncDeliveryStatusFromTags = async (
  orderId: string,
  tags: string[]
): Promise<void> => {
  const deliveryStatus = extractDeliveryStatusFromTags(tags);
  if (!deliveryStatus) return;

  let numericOrderId = orderId;
  if (orderId.startsWith("gid://shopify/Order/")) {
    numericOrderId = orderId.split("/").pop() || orderId;
  } else if (orderId.includes("/")) {
    numericOrderId = orderId.split("/").pop() || orderId;
  }

  const [customAttrResult, metafieldResult] = await Promise.allSettled([
    updateDeliveryStatusCustomAttribute(numericOrderId, deliveryStatus),
    updateDeliveryStatusMetafield(orderId, deliveryStatus),
  ]);
  const customAttrSuccess =
    customAttrResult.status === "fulfilled" && customAttrResult.value?.success === true;
  const metafieldSuccess =
    metafieldResult.status === "fulfilled" && metafieldResult.value?.success === true;
  if (customAttrSuccess || metafieldSuccess) {
    console.log(
      `[Shopify Sync] Successfully synced delivery status "${deliveryStatus}" from tags to Delivery status column for order ${numericOrderId}`
    );
  } else {
    console.warn(
      `[Shopify Sync] Failed to sync delivery status from tags for order ${numericOrderId}`
    );
  }
};

/**
 * Add tags to a Shopify order
 * Automatically syncs delivery status to Delivery status column if tags contain status info
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

    // Sync delivery status from tags to Delivery status column (non-blocking)
    syncDeliveryStatusFromTags(orderId, tags);

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
export const getShopifyOrderById = async (
  orderId: string
): Promise<ShopifyResponse<any>> => {
  try {
    // Extract numeric ID from GID format: gid://shopify/Order/123456789
    let numericOrderId: string;
    if (orderId.startsWith('gid://')) {
      const match = orderId.match(/\/(\d+)$/);
      if (match && match[1]) {
        numericOrderId = match[1];
      } else {
        return { success: false, error: 'Invalid Shopify order ID format' };
      }
    } else {
      numericOrderId = orderId;
    }

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
    const order = result.order;

    // Normalize shipping address: REST API uses snake_case (first_name, last_name)
    const rawAddr = order.shipping_address;
    const shippingAddress = rawAddr
      ? {
        address1: rawAddr.address1 ?? rawAddr.address_1 ?? "",
        address2: rawAddr.address2 ?? rawAddr.address_2 ?? "",
        city: rawAddr.city ?? "",
        province: rawAddr.province ?? "",
        zip: rawAddr.zip ?? "",
        country: rawAddr.country ?? "",
        firstName: rawAddr.firstName ?? rawAddr.first_name ?? "",
        lastName: rawAddr.lastName ?? rawAddr.last_name ?? "",
        phone: rawAddr.phone ?? "",
      }
      : null;

    // Convert to ShopifyOrder format
    const shopifyOrder: ShopifyOrder = {
      id: order.id ? `gid://shopify/Order/${order.id}` : orderId,
      name: order.name,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      cancelledAt: order.cancelled_at,
      displayFulfillmentStatus: order.fulfillment_status || 'UNFULFILLED',
      displayFinancialStatus: order.financial_status || 'PENDING',
      totalPriceSet: {
        shopMoney: {
          amount: order.total_price || '0',
          currencyCode: order.currency || 'USD',
        },
      },
      shippingAddress,
      lineItems: {
        edges: (order.line_items || []).map((item: any) => ({
          node: {
            id: item.id,
            title: item.title,
            quantity: item.quantity,
            sku: item.sku,
            vendor: item.vendor,
            originalUnitPriceSet: {
              shopMoney: {
                amount: item.price || '0',
                currencyCode: order.currency || 'USD',
              },
            },
            originalTotalSet: {
              shopMoney: {
                amount: (parseFloat(item.price || '0') * item.quantity).toString(),
                currencyCode: order.currency || 'USD',
              },
            },
          },
        })),
      },
    };

    // If order has tags, sync delivery status to the Delivery status column (so it's not empty in Shopify admin)
    const rawTags = order.tags;
    if (rawTags) {
      const tagsArray =
        typeof rawTags === "string"
          ? rawTags.split(",").map((t: string) => t.trim()).filter(Boolean)
          : Array.isArray(rawTags)
            ? rawTags
            : [];
      if (tagsArray.length > 0) {
        syncDeliveryStatusFromTags(shopifyOrder.id, tagsArray).catch(() => { });
      }
    }

    return { success: true, data: shopifyOrder };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Failed to get order details",
    };
  }
};

/**
 * Get order details including financial status and transactions (legacy function)
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
      // Handle missing permissions gracefully
      if (res.status === 403) {
        console.warn("[Shopify] Skipping fulfillments check due to missing permissions.");
        return { success: true, data: [] }; // Return empty list instead of failure
      }

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
 * Update order custom attributes for delivery status
 * This updates the "Delivery status" column visible in Shopify orders list
 * Uses REST API to update order custom attributes
 */
const updateDeliveryStatusCustomAttribute = async (
  numericOrderId: string,
  deliveryStatus: string
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: "Shopify API key not configured" };
    }

    // First, get the existing order to preserve other custom attributes
    const getOrderUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const getRes = await fetch(getOrderUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
    });

    let existingCustomAttributes: any[] = [];
    if (getRes.ok) {
      const orderData = await getRes.json();
      existingCustomAttributes = orderData.order?.note_attributes || [];
    }

    // Find if delivery_status already exists, update it; otherwise add it
    const deliveryStatusAttr = existingCustomAttributes.find(
      (attr: any) => attr.name === "delivery_status"
    );

    let updatedAttributes = existingCustomAttributes.filter(
      (attr: any) => attr.name !== "delivery_status"
    );
    updatedAttributes.push({
      name: "delivery_status",
      value: deliveryStatus,
    });

    // Update order with delivery status custom attribute
    const updateUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/orders/${numericOrderId}.json`;
    const response = await fetchWithRetry(updateUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
      },
      body: JSON.stringify({
        order: {
          id: numericOrderId,
          note_attributes: updatedAttributes,
        },
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
      };
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse response: ${responseText.substring(0, 200)}`,
      };
    }

    if (result.errors) {
      return {
        success: false,
        error: JSON.stringify(result.errors),
      };
    }

    return { success: true, data: result };
  } catch (error: any) {
    console.error(
      "[Shopify Update] Error updating delivery status custom attribute:",
      error
    );
    return {
      success: false,
      error: error.message || "Failed to update delivery status custom attribute",
    };
  }
};

/**
 * Get order tags from Shopify
 */
const getOrderTags = async (
  orderId: string
): Promise<ShopifyResponse<{ tags: string[] }>> => {
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
    const query = `
      query getOrderTags($id: ID!) {
        order(id: $id) {
          id
          tags
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
        query,
        variables: {
          id: shopifyOrderId,
        },
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
      };
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse response: ${responseText.substring(0, 200)}`,
      };
    }

    if (result.errors && result.errors.length > 0) {
      return {
        success: false,
        error: result.errors.map((e: any) => e.message).join(", "),
      };
    }

    const tags = result.data?.order?.tags || [];

    return {
      success: true,
      data: { tags },
    };
  } catch (error: any) {
    console.error("[Shopify Get] Error reading order tags:", error);
    return {
      success: false,
      error: error.message || "Failed to read order tags",
    };
  }
};

/**
* Batch sync delivery status for multiple orders
* Useful for syncing all existing orders at once
*/
export const batchSyncDeliveryStatusFromTags = async (
  orderIds: string[]
): Promise<ShopifyResponse<{ synced: number; failed: number; results: Array<{ orderId: string; success: boolean; status: string | null }> }>> => {
  const results: Array<{ orderId: string; success: boolean; status: string | null }> = [];
  let synced = 0;
  let failed = 0;

  // Process in batches of 5 to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < orderIds.length; i += batchSize) {
    const batch = orderIds.slice(i, i + batchSize);
    const batchPromises = batch.map(async (orderId) => {
      try {
        const result = await syncDeliveryStatusFromExistingTags(orderId);
        if (result.success && result.data?.synced) {
          synced++;
        } else if (!result.success) {
          failed++;
        }
        return {
          orderId,
          success: result.success,
          status: result.data?.status || null,
        };
      } catch (error) {
        failed++;
        return {
          orderId,
          success: false,
          status: null,
        };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);
    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        failed++;
        results.push({
          orderId: batch[batchResults.indexOf(result)],
          success: false,
          status: null,
        });
      }
    });

    // Small delay between batches to respect rate limits
    if (i + batchSize < orderIds.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return {
    success: true,
    data: {
      synced,
      failed,
      results,
    },
  };
};

/**
 * Sync delivery status from existing tags to Delivery status column
 * This is useful for orders that already have tags but empty Delivery status column
 */
export const syncDeliveryStatusFromExistingTags = async (
  orderId: string
): Promise<ShopifyResponse<{ synced: boolean; status: string | null }>> => {
  try {
    // Get current delivery status from metafield
    const currentStatusResult = await getDeliveryStatusFromMetafield(orderId);

    // If delivery status already exists, no need to sync
    if (currentStatusResult.success && currentStatusResult.data?.deliveryStatus) {
      return {
        success: true,
        data: {
          synced: false,
          status: currentStatusResult.data.deliveryStatus,
        },
      };
    }

    // Get order tags
    const tagsResult = await getOrderTags(orderId);
    if (!tagsResult.success || !tagsResult.data) {
      return {
        success: false,
        error: tagsResult.error || "Failed to get order tags",
      };
    }

    const tags = tagsResult.data.tags;
    const deliveryStatus = extractDeliveryStatusFromTags(tags);

    if (!deliveryStatus) {
      return {
        success: true,
        data: {
          synced: false,
          status: null,
        },
      };
    }

    // Normalize order ID for REST API
    let numericOrderId = orderId;
    if (orderId.startsWith("gid://shopify/Order/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    } else if (orderId.includes("/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    }

    // Update both custom attribute and metafield
    const [customAttrResult, metafieldResult] = await Promise.allSettled([
      updateDeliveryStatusCustomAttribute(numericOrderId, deliveryStatus),
      updateDeliveryStatusMetafield(orderId, deliveryStatus),
    ]);

    const customAttrSuccess =
      customAttrResult.status === "fulfilled" && customAttrResult.value?.success === true;
    const metafieldSuccess =
      metafieldResult.status === "fulfilled" && metafieldResult.value?.success === true;

    if (customAttrSuccess || metafieldSuccess) {
      console.log(
        `[Shopify Sync] Successfully synced delivery status "${deliveryStatus}" from existing tags for order ${numericOrderId}`
      );
      return {
        success: true,
        data: {
          synced: true,
          status: deliveryStatus,
        },
      };
    } else {
      return {
        success: false,
        error: "Failed to update delivery status column",
      };
    }
  } catch (error: any) {
    console.error("[Shopify Sync] Error syncing delivery status from existing tags:", error);
    return {
      success: false,
      error: error.message || "Failed to sync delivery status from tags",
    };
  }
};

/**
 * Get current delivery status from metafield custom.delivery_status
 * This reads the current delivery status stored in Shopify
 */
export const getDeliveryStatusFromMetafield = async (
  orderId: string
): Promise<ShopifyResponse<{ deliveryStatus: string | null }>> => {
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
    const query = `
      query getOrderMetafield($id: ID!) {
        order(id: $id) {
          id
          metafield(namespace: "custom", key: "delivery_status") {
            id
            key
            namespace
            value
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
        query,
        variables: {
          id: shopifyOrderId,
        },
      }),
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
      };
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (parseError) {
      return {
        success: false,
        error: `Failed to parse response: ${responseText.substring(0, 200)}`,
      };
    }

    if (result.errors && result.errors.length > 0) {
      return {
        success: false,
        error: result.errors.map((e: any) => e.message).join(", "),
      };
    }

    const metafield = result.data?.order?.metafield;
    const deliveryStatus = metafield?.value || null;

    return {
      success: true,
      data: { deliveryStatus },
    };
  } catch (error: any) {
    console.error(
      "[Shopify Get] Error reading delivery status metafield:",
      error
    );
    return {
      success: false,
      error: error.message || "Failed to read delivery status metafield",
    };
  }
};

/**
 * Update order metafield via orderUpdate mutation (works when metafieldsSet is restricted on Order)
 * OrderInput.metafields adds/updates metafields on the order. Matches definition custom.delivery_status.
 */
const updateDeliveryStatusMetafieldViaOrderUpdate = async (
  shopifyOrderId: string,
  deliveryStatus: string
): Promise<ShopifyResponse<any>> => {
  const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
  if (!apiKey) {
    return { success: false, error: "Shopify API key not configured" };
  }

  const graphqlUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
  const mutation = `
    mutation orderUpdate($input: OrderInput!) {
      orderUpdate(input: $input) {
        order {
          id
          metafield(namespace: "custom", key: "delivery_status") {
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const response = await fetchWithRetry(graphqlUrl, {
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
          metafields: [
            {
              namespace: "custom",
              key: "delivery_status",
              type: "single_line_text_field",
              value: deliveryStatus,
            },
          ],
        },
      },
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    return { success: false, error: `HTTP ${response.status}: ${responseText.substring(0, 300)}` };
  }

  let result: any;
  try {
    result = JSON.parse(responseText);
  } catch {
    return { success: false, error: `Failed to parse response: ${responseText.substring(0, 200)}` };
  }

  if (result.errors?.length > 0) {
    return {
      success: false,
      error: result.errors.map((e: any) => e.message).join(", "),
    };
  }

  const userErrors = result.data?.orderUpdate?.userErrors || [];
  if (userErrors.length > 0) {
    const msg = userErrors.map((e: any) => `${e.field || ""}: ${e.message}`).join(", ");
    return { success: false, error: msg };
  }

  return { success: true, data: result.data?.orderUpdate };
};



/**
 * Update order metafield for delivery status
 * Tries metafieldsSet first, then orderUpdate if that fails
 */
export const updateDeliveryStatusMetafield = async (
  orderId: string,
  deliveryStatus: string
): Promise<ShopifyResponse<any>> => {
  try {
    const apiKey = SHOPIFY_ADMIN_API_KEYS[0];
    if (!apiKey) {
      return { success: false, error: "Shopify API key not configured" };
    }

    let shopifyOrderId = orderId;
    if (!orderId.startsWith("gid://shopify/Order/")) {
      const numericId = orderId.split("/").pop() || orderId;
      shopifyOrderId = `gid://shopify/Order/${numericId}`;
    }

    const graphqlUrl = `https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;
    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id key value }
          userErrors { field message }
        }
      }
    `;

    const response = await fetchWithRetry(graphqlUrl, {
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
    if (!response.ok) {
      const err = `HTTP ${response.status}: ${responseText.substring(0, 200)}`;
      console.warn("[Shopify] metafieldsSet failed, trying orderUpdate:", err);
      return updateDeliveryStatusMetafieldViaOrderUpdate(shopifyOrderId, deliveryStatus);
    }

    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      return { success: false, error: `Failed to parse response: ${responseText.substring(0, 200)}` };
    }

    if (result.errors?.length > 0) {
      const errMsg = result.errors.map((e: any) => e.message).join(", ");
      console.warn("[Shopify] metafieldsSet errors, trying orderUpdate:", errMsg);
      return updateDeliveryStatusMetafieldViaOrderUpdate(shopifyOrderId, deliveryStatus);
    }
    const userErrors = result.data?.metafieldsSet?.userErrors || [];
    if (userErrors.length > 0) {
      const errMsg = userErrors.map((e: any) => `${e.field || ""}: ${e.message}`).join(", ");
      console.warn("[Shopify] metafieldsSet userErrors, trying orderUpdate:", errMsg);
      return updateDeliveryStatusMetafieldViaOrderUpdate(shopifyOrderId, deliveryStatus);
    }

    console.log(`[Shopify] Metafield synced successfully: ${deliveryStatus}`);
    return { success: true, data: result.data?.metafieldsSet };
  } catch (error: any) {
    console.error("[Shopify Update] Error updating delivery status metafield:", error);
    const shopifyOrderId = orderId.startsWith("gid://")
      ? orderId
      : `gid://shopify/Order/${orderId.split("/").pop() || orderId}`;
    return updateDeliveryStatusMetafieldViaOrderUpdate(shopifyOrderId, deliveryStatus);
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
        `[Shopify Update] Current fulfillment status: ${fulfillment?.status || "unknown"
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

    if (!res.ok) {
      // Try alternative payload format if first attempt fails
      if (res.status === 422 || res.status === 400) {
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

        if (altRes.ok) {
          return { success: true, data: {} };
        }
      }

      return {
        success: false,
        error: `HTTP ${res.status}: ${responseText.substring(0, 200)}`,
      };
    }

    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      if (res.ok) {
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
      return { success: false, error: JSON.stringify(result.errors) };
    }

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

      // Help user fix missing Admin API scopes
      if (
        foRes.status === 403 &&
        errorText.includes("required permission")
      ) {
        console.warn("[Shopify] Skipping fulfillment creation due to missing permissions (read_merchant_managed_fulfillment_orders).");
        return {
          success: false,
          error: "Permission denied for fulfillment orders. Skipping fulfillment creation.",
        };
      }

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
      return {
        success: false,
        error: `HTTP ${updateRes.status}: ${errorText.substring(0, 200)}`,
      };
    }

    const result = await updateRes.json();
    if (result.errors) {
      return { success: false, error: JSON.stringify(result.errors) };
    }

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
 * Update delivery status in Shopify - OPTIMIZED FOR PRODUCTION
 * Parallelizes all independent API calls for maximum performance
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

    // Normalize order ID
    let numericOrderId = orderId;
    if (orderId.startsWith("gid://shopify/Order/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    } else if (orderId.includes("/")) {
      numericOrderId = orderId.split("/").pop() || orderId;
    }

    // Map status to display values
    const deliveryStatusValue =
      status === "PICKED_UP"
        ? "Picked Up"
        : status === "IN_TRANSIT"
          ? "Out for Delivery"
          : "Delivered";

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

    // OPTIMIZATION: Run all independent updates in parallel
    // This reduces total execution time from ~2-3 seconds to ~500ms
    const [
      fulfillmentsResult,
      customAttrResult,
      metafieldResult,
      noteResult,
      tagResult,
    ] = await Promise.allSettled([
      getOrderFulfillments(numericOrderId),
      updateDeliveryStatusCustomAttribute(numericOrderId, deliveryStatusValue),
      updateDeliveryStatusMetafield(orderId, deliveryStatusValue),
      addOrderNote(numericOrderId, `[Delivery Status] ${statusMessages[status]}`),
      addOrderTags(orderId, [statusTags[status]]),
    ]);

    // Extract results with proper type guards
    const customAttrSuccess =
      customAttrResult.status === "fulfilled" && customAttrResult.value?.success === true;
    const metafieldSuccess =
      metafieldResult.status === "fulfilled" && metafieldResult.value?.success === true;
    const noteSuccess =
      noteResult.status === "fulfilled" && noteResult.value?.success === true;
    const tagSuccess =
      tagResult.status === "fulfilled" && tagResult.value?.success === true;

    // Handle fulfillment events if fulfillment exists
    let fulfillmentEventSuccess = false;
    let fulfillmentId: number | null = null;

    if (
      fulfillmentsResult.status === "fulfilled" &&
      fulfillmentsResult.value?.success &&
      fulfillmentsResult.value?.data &&
      fulfillmentsResult.value.data.length > 0
    ) {
      fulfillmentId = fulfillmentsResult.value.data[0].id;

      // Map status to GraphQL event status
      const graphqlEventStatus =
        status === "PICKED_UP"
          ? "IN_TRANSIT"
          : status === "IN_TRANSIT"
            ? "OUT_FOR_DELIVERY"
            : "DELIVERED";

      const fulfillmentGid = `gid://shopify/Fulfillment/${fulfillmentId}`;
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

        if (graphqlRes.ok) {
          const graphqlResult = await graphqlRes.json();
          if (
            !graphqlResult.errors &&
            !graphqlResult.data?.fulfillmentEventCreate?.userErrors?.length &&
            graphqlResult.data?.fulfillmentEventCreate?.fulfillmentEvent
          ) {
            fulfillmentEventSuccess = true;
          }
        }
      } catch (error) {
        // Silent fail - fulfillment events are optional
      }
    } else if (status === "DELIVERED") {
      // Only create fulfillment for DELIVERED status if it doesn't exist
      try {
        const fulfillResult = await fulfillOrder(orderId);
        if (fulfillResult.success) {
          const newFulfillmentsResult = await getOrderFulfillments(numericOrderId);
          if (
            newFulfillmentsResult.success &&
            newFulfillmentsResult.data &&
            Array.isArray(newFulfillmentsResult.data) &&
            newFulfillmentsResult.data.length > 0
          ) {
            const newFulfillmentId = newFulfillmentsResult.data[0].id;
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

            if (graphqlRes.ok) {
              const graphqlResult = await graphqlRes.json();
              if (
                graphqlResult.data?.fulfillmentEventCreate?.fulfillmentEvent
              ) {
                fulfillmentEventSuccess = true;
              }
            }
          }
        }
      } catch (error) {
        // Silent fail - fulfillment creation is optional
      }
    }

    // Determine overall success - prioritize delivery status updates
    const overallSuccess =
      customAttrSuccess || metafieldSuccess || fulfillmentEventSuccess || noteSuccess || tagSuccess;

    // Log errors only if critical updates failed
    if (!customAttrSuccess && !metafieldSuccess) {
      const customError =
        customAttrResult.status === "rejected"
          ? String(customAttrResult.reason)
          : customAttrResult.status === "fulfilled" && customAttrResult.value
            ? customAttrResult.value.error
            : "Unknown error";
      const metafieldError =
        metafieldResult.status === "rejected"
          ? String(metafieldResult.reason)
          : metafieldResult.status === "fulfilled" && metafieldResult.value
            ? metafieldResult.value.error
            : "Unknown error";
      console.error(
        `[Shopify] Failed to update delivery status for order ${numericOrderId}:`,
        { customAttr: customError, metafield: metafieldError }
      );
    }

    return {
      success: overallSuccess,
      data: {
        fulfillmentEvent: fulfillmentEventSuccess ? "Updated" : "Skipped",
        customAttribute: customAttrSuccess ? "Updated" : "Failed",
        metafield: metafieldSuccess ? "Updated" : "Failed",
        note: noteSuccess ? "Added" : "Failed",
        tag: tagSuccess ? "Added" : "Failed",
        status: deliveryStatusValue,
      },
    };
  } catch (error: any) {
    console.error("Error updating delivery status:", error);
    return {
      success: false,
      error: error.message || "Failed to update delivery status",
    };
  }
};

export type { ShopifyOrder, OrdersResponse };
