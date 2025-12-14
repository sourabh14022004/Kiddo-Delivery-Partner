import { getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../config/FirebaseConifg';
import { addOrderTags } from './shopifyService';
import { sendNewOrderNotification } from './notificationService';
import * as FileSystem from 'expo-file-system';

const ORDERS_COLLECTION = 'orders';
const RIDERS_COLLECTION = 'deliveryPartners'; // Using the same collection as user details

/**
 * Convert Shopify order ID to a safe Firestore document ID
 * Shopify IDs are in format: gid://shopify/Order/6889098707233
 * Firestore doesn't allow "//" in document IDs, so we extract just the numeric part
 */
export const getSafeOrderId = (shopifyOrderId: string): string => {
  // If it's already a numeric ID, return it
  if (/^\d+$/.test(shopifyOrderId)) {
    return shopifyOrderId;
  }
  
  // Extract numeric ID from GID format: gid://shopify/Order/6889098707233
  const match = shopifyOrderId.match(/\/(\d+)$/);
  if (match && match[1]) {
    return match[1];
  }
  
  // Fallback: remove all non-alphanumeric characters except underscores and hyphens
  return shopifyOrderId.replace(/[^a-zA-Z0-9_-]/g, '_');
};

export interface OrderAssignmentResult {
  success: boolean;
  error?: string;
  orderId?: string;
}

/**
 * Assign an order to a rider using Firestore transaction
 * This ensures atomicity - only one rider can pick an order
 * Also updates Shopify order tags
 */
export const assignOrderToRider = async (
  orderId: string,
  riderId: string
): Promise<OrderAssignmentResult> => {
  try {
    // Convert Shopify order ID to safe Firestore document ID
    const safeOrderId = getSafeOrderId(orderId);
    const orderRef = doc(db, ORDERS_COLLECTION, safeOrderId);
    const riderRef = doc(db, RIDERS_COLLECTION, riderId);

    // Step 1: Lock the order in Firebase
    await runTransaction(db, async (transaction) => {
      // Read the order document
      const orderDoc = await transaction.get(orderRef);
      
      if (!orderDoc.exists()) {
        throw new Error('Order not found');
      }

      const orderData = orderDoc.data();

      // Check if order is already assigned
      if (orderData.assignedTo && orderData.assignedTo !== riderId) {
        throw new Error('Order already taken by another rider');
      }

      // Check if order is already assigned to this rider
      if (orderData.assignedTo === riderId) {
        throw new Error('Order is already assigned to you');
      }

      // Check if rider already has an active order
      const riderDoc = await transaction.get(riderRef);
      if (riderDoc.exists() && riderDoc.data().activeOrderId) {
        throw new Error('You already have an active order. Please complete it first.');
      }

      // Assign order to rider
      transaction.update(orderRef, {
        assignedTo: riderId,
        status: 'ASSIGNED',
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // Update rider's active order (store both safe ID and original Shopify ID)
      transaction.set(
        riderRef,
        {
          activeOrderId: safeOrderId,
          activeOrderShopifyId: orderId, // Store original Shopify ID for reference
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    });

    // Step 2: Update Shopify order tags (non-blocking, but log errors)
    const shopifyTag = `assigned_to_rider_${riderId}`;
    const shopifyResult = await addOrderTags(orderId, [shopifyTag]);
    
    if (!shopifyResult.success) {
      console.warn('Failed to update Shopify tags, but order is assigned in Firebase:', shopifyResult.error);
      // Don't fail the whole operation if Shopify update fails
    } else {
      console.log('Shopify order tags updated successfully');
    }

    console.log(`Order ${orderId} successfully assigned to rider ${riderId}`);
    return {
      success: true,
      orderId,
    };
  } catch (error: any) {
    console.error('Error assigning order to rider:', error);
    return {
      success: false,
      error: error.message || 'Failed to assign order',
    };
  }
};

/**
 * Get rider's active order from Firestore
 */
export const getRiderActiveOrder = async (riderId: string): Promise<{ success: boolean; orderId?: string; error?: string }> => {
  try {
    const riderRef = doc(db, RIDERS_COLLECTION, riderId);
    const riderDoc = await getDoc(riderRef);

    if (riderDoc.exists()) {
      const riderData = riderDoc.data();
      const activeOrderId = riderData.activeOrderId;
      
      if (activeOrderId) {
        console.log(`Rider ${riderId} has active order: ${activeOrderId}`);
        return {
          success: true,
          orderId: activeOrderId,
        };
      } else {
        console.log(`Rider ${riderId} has no active order`);
        return {
          success: true,
          orderId: undefined,
        };
      }
    } else {
      return {
        success: true,
        orderId: undefined,
      };
    }
  } catch (error: any) {
    console.error('Error getting rider active order:', error);
    return {
      success: false,
      error: error.message || 'Failed to get rider active order',
    };
  }
};

/**
 * Get all orders assigned to a rider from Firestore
 */
export const getRiderOrders = async (riderId: string): Promise<{ success: boolean; orders?: any[]; error?: string }> => {
  try {
    const ordersRef = collection(db, ORDERS_COLLECTION);
    const q = query(ordersRef, where('assignedTo', '==', riderId));
    const querySnapshot = await getDocs(q);

    const orders: any[] = [];
    querySnapshot.forEach((doc) => {
      orders.push({ id: doc.id, ...doc.data() });
    });

    // Sort by assignedAt descending (most recent first)
    orders.sort((a, b) => {
      const aTime = a.assignedAt?.toMillis?.() || 0;
      const bTime = b.assignedAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    console.log(`Found ${orders.length} orders for rider ${riderId}`);
    return {
      success: true,
      orders,
    };
  } catch (error: any) {
    console.error('Error getting rider orders:', error);
    return {
      success: false,
      error: error.message || 'Failed to get rider orders',
    };
  }
};

/**
 * Check if an order is assigned to any rider
 */
export const isOrderAssigned = async (shopifyOrderId: string): Promise<boolean> => {
  try {
    const safeOrderId = getSafeOrderId(shopifyOrderId);
    const orderRef = doc(db, ORDERS_COLLECTION, safeOrderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return false; // Order doesn't exist in Firestore, so not assigned
    }

    const orderData = orderDoc.data();
    return !!(orderData.assignedTo && orderData.assignedTo !== null);
  } catch (error: any) {
    console.error('Error checking order assignment:', error);
    return false; // On error, assume not assigned to avoid hiding orders
  }
};

/**
 * Get order details from Firestore
 */
export const getOrderDetails = async (orderId: string) => {
  try {
    // Convert Shopify order ID to safe Firestore document ID
    const safeOrderId = getSafeOrderId(orderId);
    const orderRef = doc(db, ORDERS_COLLECTION, safeOrderId);
    const orderDoc = await getDoc(orderRef);

    if (!orderDoc.exists()) {
      return {
        success: false,
        error: 'Order not found',
        data: null,
      };
    }

    return {
      success: true,
      data: { id: orderDoc.id, ...orderDoc.data() },
    };
  } catch (error: any) {
    console.error('Error getting order details:', error);
    return {
      success: false,
      error: error.message || 'Failed to get order details',
      data: null,
    };
  }
};

// /**
//  * Upload delivery image to Firebase Storage
//  * Uses expo-file-system to read the file and upload to Firebase Storage
//  */
// export const uploadDeliveryImage = async (
//   orderId: string,
//   imageUri: string
// ): Promise<{ success: boolean; imageUrl?: string; error?: string }> => {
//   try {
//     const safeOrderId = getSafeOrderId(orderId);
//     
//     // Read the image file as base64
//     const base64 = await FileSystem.readAsStringAsync(imageUri, {
//       encoding: FileSystem.EncodingType.Base64,
//     });
//     
//     // Create a reference to the file in Firebase Storage
//     const timestamp = Date.now();
//     const imageRef = ref(storage, `delivery-images/${safeOrderId}/${timestamp}.jpg`);
//     
//     // Upload using uploadString with base64 encoding (simpler and more reliable)
//     await uploadString(imageRef, base64, 'base64', {
//       contentType: 'image/jpeg',
//     });
//     
//     // Get the download URL
//     const downloadURL = await getDownloadURL(imageRef);
//     
//     console.log('Delivery image uploaded successfully:', downloadURL);
//     return {
//       success: true,
//       imageUrl: downloadURL,
//     };
//   } catch (error: any) {
//     console.error('Error uploading delivery image:', error);
//     console.error('Error details:', JSON.stringify(error, null, 2));
//     return {
//       success: false,
//       error: error.message || 'Failed to upload delivery image',
//     };
//   }
// };

/**
 * Update order status in Firestore
 */
export const updateOrderStatus = async (
  shopifyOrderId: string,
  status: 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'RETURNED',
  // deliveryImageUrl?: string // Commented out for now
): Promise<{ success: boolean; error?: string }> => {
  try {
    const safeOrderId = getSafeOrderId(shopifyOrderId);
    const orderRef = doc(db, ORDERS_COLLECTION, safeOrderId);
    const orderSnapshot = await getDoc(orderRef);
    const assignedTo = orderSnapshot.exists() ? orderSnapshot.data().assignedTo : undefined;

    await setDoc(
      orderRef,
      {
        status,
        updatedAt: serverTimestamp(),
        ...(status === 'PICKED_UP' && { pickedUpAt: serverTimestamp() }),
        ...(status === 'IN_TRANSIT' && { inTransitAt: serverTimestamp() }),
        ...(status === 'DELIVERED' && { 
          deliveredAt: serverTimestamp(),
          // ...(deliveryImageUrl && { deliveryImageUrl }), // Commented out for now
        }),
        ...(status === 'RETURNED' && { 
          returnedAt: serverTimestamp(),
        }),
      },
      { merge: true }
    );

    // If delivered, clear rider's active order so they can pick the next one
    if (status === 'DELIVERED' && assignedTo) {
      const riderRef = doc(db, RIDERS_COLLECTION, assignedTo);
      const riderSnapshot = await getDoc(riderRef);
      const riderActiveOrderId = riderSnapshot.exists()
        ? riderSnapshot.data().activeOrderId
        : undefined;

      if (riderActiveOrderId === safeOrderId) {
        await setDoc(
          riderRef,
          {
            activeOrderId: null,
            activeOrderShopifyId: null,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        console.log(`Cleared active order for rider ${assignedTo} after delivery of ${shopifyOrderId}`);
      }
    }

    console.log(`Order ${shopifyOrderId} status updated to ${status}`);
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('Error updating order status:', error);
    return {
      success: false,
      error: error.message || 'Failed to update order status',
    };
  }
};

/**
 * Sync Shopify order to Firestore
 * This should be called when displaying orders to ensure they exist in Firestore
 * If it's a new order, sends notifications to all delivery partners
 */
export const syncShopifyOrderToFirestore = async (shopifyOrder: any) => {
  try {
    // Convert Shopify order ID to safe Firestore document ID
    const safeOrderId = getSafeOrderId(shopifyOrder.id);
    const orderRef = doc(db, ORDERS_COLLECTION, safeOrderId);
    
    // Check if order already exists
    const orderDoc = await getDoc(orderRef);
    const isNewOrder = !orderDoc.exists();
    
    const orderData = {
      shopifyOrderId: shopifyOrder.id,
      shopifyOrderName: shopifyOrder.name,
      createdAt: shopifyOrder.createdAt,
      updatedAt: serverTimestamp(),
      status: orderDoc.exists() ? orderDoc.data().status || 'PENDING' : 'PENDING',
      assignedTo: orderDoc.exists() ? orderDoc.data().assignedTo || null : null,
      // Store Shopify order data
      shopifyData: {
        displayFulfillmentStatus: shopifyOrder.displayFulfillmentStatus,
        displayFinancialStatus: shopifyOrder.displayFinancialStatus,
        totalPrice: shopifyOrder.totalPriceSet,
        shippingAddress: shopifyOrder.shippingAddress,
        lineItems: shopifyOrder.lineItems,
      },
    };

    await setDoc(orderRef, orderData, { merge: true });
    console.log(`Synced Shopify order ${shopifyOrder.id} to Firestore`);
    
    // If it's a new order and not already assigned, send notifications
    if (isNewOrder && !orderData.assignedTo) {
      // Only send notifications for unfulfilled orders
      if (
        shopifyOrder.displayFulfillmentStatus !== 'FULFILLED' &&
        shopifyOrder.displayFulfillmentStatus !== 'DELIVERED'
      ) {
        const totalPrice = shopifyOrder.totalPriceSet?.shopMoney;
        const notificationResult = await sendNewOrderNotification({
          orderId: shopifyOrder.id,
          orderName: shopifyOrder.name,
          totalPrice: totalPrice?.amount || '0',
          currencyCode: totalPrice?.currencyCode || 'USD',
          shippingAddress: shopifyOrder.shippingAddress || {},
        }).catch((err) => {
          console.warn('Failed to send notification for new order:', err);
          // Don't fail the sync if notification fails
        });

        if (notificationResult?.success) {
          console.log(`✅ Sent notifications for new order ${shopifyOrder.id} to ${notificationResult.sentCount} delivery partners`);
        }
      }
    }
    
    return {
      success: true,
      orderId: shopifyOrder.id,
      isNewOrder,
    };
  } catch (error: any) {
    console.error('Error syncing Shopify order to Firestore:', error);
    return {
      success: false,
      error: error.message || 'Failed to sync order',
    };
  }
};

