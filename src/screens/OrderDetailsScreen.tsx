import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Switch,
  Linking,
  Image,
  Platform,
  Dimensions,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { getOrderDetails, updateOrderStatus } from "../services/orderService";
import LoadingScreen from "../components/LoadingScreen";
import {
  markOrderAsPickedUp,
  markOrderAsInProgress,
  markOrderAsDelivered,
  markCodOrderAsPaid,
  updateDeliveryStatus,
} from "../services/shopifyService";
import { WAREHOUSE_ADDRESS } from "../config/config";
import DeliverySuccessScreen from "../components/DeliverySuccessScreen";
import { theme } from "../config/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

interface OrderDetailsScreenProps {
  orderId: string;
  phoneNumber?: string;
  onBack?: () => void;
}

const OrderDetailsScreen: React.FC<OrderDetailsScreenProps> = ({
  orderId,
  phoneNumber,
  onBack,
}) => {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPickedUp, setIsPickedUp] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);
  const [isDelivered, setIsDelivered] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);

  useEffect(() => {
    loadOrderDetails();
  }, [orderId]);

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await getOrderDetails(orderId);

      if (result.success && result.data) {
        setOrder(result.data);
        const orderData = result.data as any;
        const status = orderData.status || "PENDING";
        setIsPickedUp(
          status === "PICKED_UP" ||
            status === "IN_TRANSIT" ||
            status === "DELIVERED"
        );
        setIsInProgress(status === "IN_TRANSIT" || status === "DELIVERED");
        setIsDelivered(status === "DELIVERED");
      } else {
        setError(result.error || "Failed to load order details");
      }
    } catch (err: any) {
      console.error("Error loading order details:", err);
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | any) => {
    if (!dateString) return "N/A";
    const date = dateString.toDate ? dateString.toDate() : new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatPrice = (amount: string, currencyCode: string) => {
    return `${currencyCode} ${parseFloat(amount).toFixed(2)}`;
  };

  const openMaps = (address: string) => {
    if (!address) return;
    const encoded = encodeURIComponent(address);
    const url = `https://maps.google.com/?q=${encoded}`;
    Linking.openURL(url).catch((err) =>
      console.error("Error opening maps:", err)
    );
  };

  const handlePickedUpToggle = async (value: boolean) => {
    if (updatingStatus) return;
    setUpdatingStatus(true);
    try {
      const newStatus = value ? "PICKED_UP" : "ASSIGNED";
      setIsPickedUp(value);
      setOrder((prevOrder: any) => ({
        ...prevOrder,
        status: newStatus,
      }));

      const shopifyOrderId = (order as any).shopifyOrderId || orderId;
      const shopifyUpdates = value
        ? (async () => {
            const [deliveryStatusResult, shopifyResult] =
              await Promise.allSettled([
                updateDeliveryStatus(shopifyOrderId, "PICKED_UP"),
                markOrderAsPickedUp(shopifyOrderId),
              ]);

            const errors: string[] = [];
            if (
              deliveryStatusResult.status === "rejected" ||
              (deliveryStatusResult.status === "fulfilled" &&
                !deliveryStatusResult.value.success)
            ) {
              errors.push(
                `Delivery status: ${
                  deliveryStatusResult.status === "rejected"
                    ? deliveryStatusResult.reason
                    : deliveryStatusResult.value.error
                }`
              );
            }
            if (
              shopifyResult.status === "rejected" ||
              (shopifyResult.status === "fulfilled" &&
                !shopifyResult.value.success)
            ) {
              errors.push(
                `Tag: ${
                  shopifyResult.status === "rejected"
                    ? shopifyResult.reason
                    : shopifyResult.value.error
                }`
              );
            }

            if (errors.length > 0) {
              console.warn("Some Shopify updates failed:", errors);
            }
            return { errors };
          })()
        : Promise.resolve({ errors: [] });

      const firestoreUpdate = updateOrderStatus(orderId, newStatus);
      const [shopifyResult, firestoreResult] = await Promise.allSettled([
        shopifyUpdates,
        firestoreUpdate,
      ]);

      if (
        firestoreResult.status === "rejected" ||
        (firestoreResult.status === "fulfilled" &&
          !firestoreResult.value.success)
      ) {
        const errorMsg =
          firestoreResult.status === "rejected"
            ? firestoreResult.reason?.message || "Failed to update order status"
            : firestoreResult.value.error || "Failed to update order status";

        setIsPickedUp(!value);
        setOrder((prevOrder: any) => ({
          ...prevOrder,
          status: value ? "ASSIGNED" : "PICKED_UP",
        }));

        Alert.alert("Error", errorMsg);
        setUpdatingStatus(false);
        return;
      }

      Alert.alert(
        "Success",
        value
          ? 'Order marked as picked up. When you start delivery, toggle "In Progress".'
          : "Order status updated"
      );
    } catch (err: any) {
      console.error("Error updating order status:", err);
      setIsPickedUp(!value);
      setOrder((prevOrder: any) => ({
        ...prevOrder,
        status: value ? "ASSIGNED" : "PICKED_UP",
      }));
      Alert.alert("Error", err.message || "Failed to update order status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleInProgressToggle = async (value: boolean) => {
    if (updatingStatus) return;
    if (value && !isPickedUp) {
      Alert.alert("Error", 'Please mark the order as "Picked Up" first');
      return;
    }

    setUpdatingStatus(true);
    try {
      const newStatus = value ? "IN_TRANSIT" : "PICKED_UP";
      setIsInProgress(value);
      setOrder((prevOrder: any) => ({
        ...prevOrder,
        status: newStatus,
      }));

      const shopifyOrderId = (order as any).shopifyOrderId || orderId;
      const shopifyUpdates = value
        ? (async () => {
            const [deliveryStatusResult, shopifyResult] =
              await Promise.allSettled([
                updateDeliveryStatus(shopifyOrderId, "IN_TRANSIT"),
                markOrderAsInProgress(shopifyOrderId),
              ]);

            const errors: string[] = [];
            if (
              deliveryStatusResult.status === "rejected" ||
              (deliveryStatusResult.status === "fulfilled" &&
                !deliveryStatusResult.value.success)
            ) {
              errors.push(
                `Delivery status: ${
                  deliveryStatusResult.status === "rejected"
                    ? deliveryStatusResult.reason
                    : deliveryStatusResult.value.error
                }`
              );
            }
            if (
              shopifyResult.status === "rejected" ||
              (shopifyResult.status === "fulfilled" &&
                !shopifyResult.value.success)
            ) {
              errors.push(
                `Tag: ${
                  shopifyResult.status === "rejected"
                    ? shopifyResult.reason
                    : shopifyResult.value.error
                }`
              );
            }

            if (errors.length > 0) {
              console.warn("Some Shopify updates failed:", errors);
            }
            return { errors };
          })()
        : Promise.resolve({ errors: [] });

      const firestoreUpdate = updateOrderStatus(orderId, newStatus);
      const [shopifyResult, firestoreResult] = await Promise.allSettled([
        shopifyUpdates,
        firestoreUpdate,
      ]);

      if (
        firestoreResult.status === "rejected" ||
        (firestoreResult.status === "fulfilled" &&
          !firestoreResult.value.success)
      ) {
        const errorMsg =
          firestoreResult.status === "rejected"
            ? firestoreResult.reason?.message || "Failed to update order status"
            : firestoreResult.value.error || "Failed to update order status";

        setIsInProgress(!value);
        setOrder((prevOrder: any) => ({
          ...prevOrder,
          status: value ? "PICKED_UP" : "IN_TRANSIT",
        }));

        Alert.alert("Error", errorMsg);
        setUpdatingStatus(false);
        return;
      }

      if (value) {
        const shippingAddress = order.shopifyData?.shippingAddress;
        if (shippingAddress?.address1) {
          const fullAddress = `${shippingAddress.address1}, ${
            shippingAddress.city || ""
          } ${shippingAddress.province || ""} ${
            shippingAddress.zip || ""
          }`.trim();
          openMaps(fullAddress);
        }
      }

      Alert.alert(
        "Success",
        value ? "Order marked as in progress" : "Order status updated"
      );
    } catch (err: any) {
      console.error("Error updating order status:", err);
      setIsInProgress(!value);
      setOrder((prevOrder: any) => ({
        ...prevOrder,
        status: value ? "PICKED_UP" : "IN_TRANSIT",
      }));
      Alert.alert("Error", err.message || "Failed to update order status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDeliveredToggle = async (value: boolean) => {
    if (updatingStatus) return;
    if (value && !isInProgress) {
      Alert.alert("Error", 'Please mark the order as "In Progress" first');
      return;
    }

    setUpdatingStatus(true);
    try {
      const newStatus = value ? "DELIVERED" : "IN_TRANSIT";
      setIsDelivered(value);
      setOrder((prevOrder: any) => ({
        ...prevOrder,
        status: newStatus,
      }));

      const shopifyOrderId = (order as any).shopifyOrderId || orderId;
      const shopifyUpdates = value
        ? (async () => {
            const updateErrors: string[] = [];

            const [deliveryStatusResult, shopifyTagResult, paidResult] =
              await Promise.allSettled([
                updateDeliveryStatus(shopifyOrderId, "DELIVERED"),
                markOrderAsDelivered(shopifyOrderId),
                (async () => {
                  const financialStatus =
                    order.shopifyData?.displayFinancialStatus;
                  if (
                    financialStatus &&
                    financialStatus !== "PAID" &&
                    financialStatus !== "AUTHORIZED"
                  ) {
                    return await markCodOrderAsPaid(shopifyOrderId);
                  }
                  return { success: true };
                })(),
              ]);

            if (
              deliveryStatusResult.status === "rejected" ||
              (deliveryStatusResult.status === "fulfilled" &&
                !deliveryStatusResult.value.success)
            ) {
              updateErrors.push(
                `Delivery status: ${
                  deliveryStatusResult.status === "rejected"
                    ? deliveryStatusResult.reason
                    : deliveryStatusResult.value.error
                }`
              );
            }

            if (
              shopifyTagResult.status === "rejected" ||
              (shopifyTagResult.status === "fulfilled" &&
                !shopifyTagResult.value.success)
            ) {
              updateErrors.push(
                `Tag: ${
                  shopifyTagResult.status === "rejected"
                    ? shopifyTagResult.reason
                    : shopifyTagResult.value.error
                }`
              );
            }

            if (
              paidResult.status === "rejected" ||
              (paidResult.status === "fulfilled" && !paidResult.value.success)
            ) {
              updateErrors.push(
                `Payment: ${
                  paidResult.status === "rejected"
                    ? paidResult.reason
                    : paidResult.value.error
                }`
              );
            }

            if (updateErrors.length > 0) {
              console.warn("Some Shopify updates failed:", updateErrors);
            }

            return { errors: updateErrors };
          })()
        : Promise.resolve({ errors: [] });

      const firestoreUpdate = updateOrderStatus(orderId, newStatus);
      const [shopifyResult, firestoreResult] = await Promise.allSettled([
        shopifyUpdates,
        firestoreUpdate,
      ]);

      if (
        firestoreResult.status === "rejected" ||
        (firestoreResult.status === "fulfilled" &&
          !firestoreResult.value.success)
      ) {
        const errorMsg =
          firestoreResult.status === "rejected"
            ? firestoreResult.reason?.message || "Failed to update order status"
            : firestoreResult.value.error || "Failed to update order status";

        setIsDelivered(!value);
        setOrder((prevOrder: any) => ({
          ...prevOrder,
          status: value ? "IN_TRANSIT" : "DELIVERED",
        }));

        Alert.alert("Error", errorMsg);
        setUpdatingStatus(false);
        return;
      }

      const shopifyErrors =
        shopifyResult.status === "fulfilled" ? shopifyResult.value.errors : [];
      if (value) {
        setShowSuccessScreen(true);
        if (shopifyErrors.length > 0) {
          console.warn(
            "Order updated but some Shopify updates failed:",
            shopifyErrors
          );
        }
      } else {
        if (shopifyErrors.length > 0) {
          Alert.alert("Success", "Order status updated", undefined, {
            cancelable: true,
          });
          console.warn(
            "Order updated but some Shopify updates failed:",
            shopifyErrors
          );
        } else {
          Alert.alert("Success", "Order status updated");
        }
      }
    } catch (err: any) {
      console.error("Error updating order status:", err);
      setIsDelivered(!value);
      setOrder((prevOrder: any) => ({
        ...prevOrder,
        status: value ? "IN_TRANSIT" : "DELIVERED",
      }));
      Alert.alert("Error", err.message || "Failed to update order status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (showSuccessScreen) {
    return (
      <DeliverySuccessScreen
        onContinue={() => {
          setShowSuccessScreen(false);
          if (onBack) {
            onBack();
          }
        }}
      />
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar style="light" />
        <LoadingScreen message="Loading order details..." fullScreen />
      </SafeAreaView>
    );
  }

  if (error || !order) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <StatusBar style="light" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorText}>
            {error || "Failed to load order details"}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadOrderDetails}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const shopifyData = order.shopifyData || {};
  const shippingAddress = shopifyData.shippingAddress || {};
  const lineItems = shopifyData.lineItems?.edges || [];
  const totalPrice =
    shopifyData.totalPriceSet?.shopMoney ||
    shopifyData.totalPrice?.shopMoney ||
    {};

  const handleCallCustomer = () => {
    const customerPhone = shippingAddress?.phone;
    if (!customerPhone) {
      Alert.alert("Error", "Customer phone number is not available");
      return;
    }

    // Remove any non-numeric characters except +
    const phoneNumber = customerPhone.replace(/[^\d+]/g, "");
    const phoneUrl = `tel:${phoneNumber}`;

    Linking.openURL(phoneUrl).catch((err) => {
      console.error("Error making phone call:", err);
      Alert.alert(
        "Error",
        "Unable to make phone call. Please check if your device supports phone calls."
      );
    });
  };

  // Get order status for progress indicator
  // 4 steps: Assigned -> Picked Up -> In Progress -> Delivered
  const orderStatus = order.status || "PENDING";

  // Determine which steps are completed based on order status
  const isAssignedOrLater = [
    "ASSIGNED",
    "PICKED_UP",
    "IN_TRANSIT",
    "DELIVERED",
  ].includes(orderStatus);
  const isPickedUpOrLater = ["PICKED_UP", "IN_TRANSIT", "DELIVERED"].includes(
    orderStatus
  );
  const isInProgressOrLater = ["IN_TRANSIT", "DELIVERED"].includes(orderStatus);
  const isOrderDelivered = orderStatus === "DELIVERED";

  const progressSteps = [
    { completed: isAssignedOrLater }, // Step 1: Assigned
    { completed: isPickedUpOrLater }, // Step 2: Picked Up
    { completed: isInProgressOrLater }, // Step 3: In Progress
    { completed: isOrderDelivered }, // Step 4: Delivered
  ];

  // Format locations
  const fromLocation = WAREHOUSE_ADDRESS.split(",")[0] || "Warehouse";
  const toLocation = shippingAddress.city || "Destination";

  // Calculate estimated delivery date (created date + 1 day)
  const createdDate = order.createdAt
    ? order.createdAt.toDate
      ? order.createdAt.toDate()
      : new Date(order.createdAt)
    : new Date();
  const estimatedDate = new Date(createdDate);
  estimatedDate.setDate(estimatedDate.getDate() + 1);

  // Get customer name
  const customerName =
    shippingAddress.firstName && shippingAddress.lastName
      ? `${shippingAddress.firstName} ${shippingAddress.lastName}`
      : shippingAddress.firstName || "Customer";

  // Calculate total quantity and weight (placeholder)
  const totalQuantity = lineItems.reduce(
    (sum: number, item: any) => sum + (item.node?.quantity || 0),
    0
  );
  const totalWeight = `${totalQuantity * 2} Kg`; // Placeholder calculation

  // Get status display
  const getStatusDisplay = () => {
    switch (orderStatus) {
      case "ASSIGNED":
      case "PICKED_UP":
        return "Transit";
      case "IN_TRANSIT":
        return "In Transit";
      case "DELIVERED":
        return "Delivered";
      default:
        return "Pending";
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerButton}>
          <Text style={styles.headerButtonIcon}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location Tracking</Text>
        <TouchableOpacity
          style={styles.headerCallButton}
          onPress={handleCallCustomer}
        >
          <Text style={styles.headerCallButtonIcon}>📞</Text>
        </TouchableOpacity>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPlaceholder}>
          {/* Route line */}
          <View style={styles.routeLine} />

          {/* Origin marker */}
          <View style={[styles.marker, styles.originMarker]}>
            <Text style={styles.markerIcon}>🏠</Text>
          </View>

          {/* Current location marker */}
          <View style={[styles.marker, styles.currentLocationMarker]}>
            <Text style={styles.navigationIcon}>↑</Text>
          </View>

          {/* Destination marker */}
          <View style={[styles.marker, styles.destinationMarker]}>
            <Text style={styles.markerIcon}>📍</Text>
          </View>
        </View>
      </View>

      {/* Bottom Sheet */}
      <View style={styles.bottomSheet}>
        {/* Grab Handle */}
        <View style={styles.grabHandle} />

        <ScrollView
          style={styles.bottomSheetContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Booking ID and Status */}
          <View style={styles.bookingRow}>
            <View style={styles.bookingIdSection}>
              <Text style={styles.bookingLabel}>Booking Id:</Text>
              <Text style={styles.bookingId}>
                {order.shopifyOrderName || orderId}
              </Text>
            </View>
            <View style={styles.statusSection}>
              <Text style={styles.statusLabel}>Status</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{getStatusDisplay()}</Text>
              </View>
            </View>
          </View>

          {/* Progress Indicator with Circular Buttons */}
          <View style={styles.progressWrapper}>
            <View style={styles.progressContainer}>
              {progressSteps.map((step, index) => (
                <React.Fragment key={index}>
                  <View style={styles.progressStep}>
                    <TouchableOpacity
                      style={[
                        styles.progressCircle,
                        step.completed && styles.progressCircleCompleted,
                      ]}
                      onPress={() => {
                        if (index === 1 && !updatingStatus) {
                          handlePickedUpToggle(!isPickedUp);
                        } else if (
                          index === 2 &&
                          !updatingStatus &&
                          (isPickedUp || isInProgress)
                        ) {
                          handleInProgressToggle(!isInProgress);
                        } else if (
                          index === 3 &&
                          !updatingStatus &&
                          (isInProgress || isDelivered)
                        ) {
                          handleDeliveredToggle(!isDelivered);
                        }
                      }}
                      disabled={
                        updatingStatus ||
                        (index === 2 && !isPickedUp && !isInProgress) ||
                        (index === 3 && !isInProgress && !isDelivered)
                      }
                      activeOpacity={0.7}
                    >
                      {step.completed && (
                        <Text style={styles.progressCheck}>✓</Text>
                      )}
                    </TouchableOpacity>
                    {/* Progress Label below each circle */}
                    <Text style={[
                      styles.progressLabel,
                      step.completed && styles.progressLabelCompleted
                    ]} numberOfLines={1}>
                      {index === 0 ? 'Assigned' : index === 1 ? 'Picked Up' : index === 2 ? 'In Progress' : 'Delivered'}
                    </Text>
                  </View>
                  {index < progressSteps.length - 1 && (
                    <View
                      style={[
                        styles.progressConnector,
                        step.completed && styles.progressConnectorCompleted,
                      ]}
                    />
                  )}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* Dates and Locations */}
          <View style={styles.datesRow}>
            <View style={styles.dateSectionLeft}>
              <Text style={styles.dateLabel}>
                Created, {formatDate(order.createdAt)}
              </Text>
              <Text style={styles.locationTextLeft}>{fromLocation}</Text>
            </View>
            <View style={styles.dateSectionRight}>
              <Text style={styles.dateLabelRight}>
                Estimated, {formatDate(estimatedDate.toISOString())}
              </Text>
              <Text style={styles.locationTextRight}>{toLocation}</Text>
            </View>
          </View>

          {/* From/To Details with Package */}
          <View style={styles.detailsRow}>
            <View style={styles.detailsLeft}>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>From</Text>
                <Text style={styles.detailValue}>{fromLocation}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Customer</Text>
                <Text style={styles.detailValue}>{customerName}</Text>
              </View>
              <View style={styles.detailItem}>
                <Text style={styles.detailLabel}>Quantity</Text>
                <Text style={styles.detailValue}>
                  {totalQuantity} Box{totalQuantity !== 1 ? "es" : ""}
                </Text>
              </View>
            </View>
            <View style={styles.detailsRight}>
              <View style={styles.detailItemRight}>
                <Text style={[styles.detailLabel, styles.detailLabelRight]}>
                  To
                </Text>
                <Text style={[styles.detailValue, styles.detailValueRight]}>
                  {toLocation}
                </Text>
              </View>
              <View style={styles.detailItemRight}>
                <Text style={[styles.detailLabel, styles.detailLabelRight]}>
                  Order Cost
                </Text>
                <Text style={[styles.detailValue, styles.detailValueRight]}>
                  {totalPrice.amount
                    ? formatPrice(
                        totalPrice.amount,
                        totalPrice.currencyCode || "$"
                      )
                    : "N/A"}
                </Text>
              </View>
              <View style={styles.detailItemRight}>
                <Text style={[styles.detailLabel, styles.detailLabelRight]}>
                  Weight
                </Text>
                <Text style={[styles.detailValue, styles.detailValueRight]}>
                  {totalWeight}
                </Text>
              </View>
            </View>
            <View style={styles.packageImageContainer}>
              <Image
                source={require("../../assets/Package-3d-icon.png")}
                style={styles.packageImage}
                // resizeMode="contain"
              />
            </View>
          </View>

          {/* Add padding at bottom for courier section overflow */}
          <View style={{ height: 100 }} />
        </ScrollView>
      </View>

      {/* Courier Contact Section - Overflowing */}
      <View style={styles.courierSectionOverflow}>
        <View style={styles.courierInfo}>
          <View style={styles.courierAvatar}>
            <Text style={styles.courierAvatarText}>
              {phoneNumber ? phoneNumber.charAt(phoneNumber.length - 1) : "D"}
            </Text>
          </View>
          <View style={styles.courierDetails}>
            <Text style={styles.courierName}>
              {phoneNumber || "Delivery Partner"}
            </Text>
            <Text style={styles.courierRole}>Courier</Text>
          </View>
        </View>
        <View style={styles.courierActions}>
          <TouchableOpacity style={styles.courierButton}>
            <Text style={styles.courierButtonIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.courierButton, styles.courierButtonSecondary]}
          >
            <Text style={styles.courierButtonIconSecondary}>💬</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundDark,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: "#F5F5F5",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.textLight,
    justifyContent: "center",
    alignItems: "center",
  },
  headerButtonIcon: {
    fontSize: 20,
    color: theme.colors.primary,
    fontWeight: "bold",
  },
  headerCallButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.success,
    justifyContent: "center",
    alignItems: "center",
  },
  headerCallButtonIcon: {
    fontSize: 20,
    color: theme.colors.textLight,
    fontWeight: "bold",
  },
  headerTitle: {
    ...theme.typography.h3,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  mapContainer: {
    height: SCREEN_HEIGHT * 0.5,
    backgroundColor: "#E8E8E8",
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    position: "relative",
  },
  routeLine: {
    position: "absolute",
    left: "15%",
    top: "30%",
    width: "70%",
    height: 3,
    backgroundColor: theme.colors.primary,
    transform: [{ rotate: "25deg" }],
    borderRadius: 2,
  },
  marker: {
    position: "absolute",
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.backgroundDark,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: theme.colors.textLight,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  originMarker: {
    left: "10%",
    top: "25%",
  },
  currentLocationMarker: {
    left: "45%",
    top: "50%",
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.textLight,
  },
  destinationMarker: {
    right: "10%",
    top: "20%",
    backgroundColor: "#FF6B35",
    borderColor: theme.colors.textLight,
  },
  markerIcon: {
    fontSize: 24,
  },
  navigationIcon: {
    fontSize: 24,
    color: theme.colors.textLight,
    fontWeight: "bold",
  },
  bottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.primaryDark,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    maxHeight: SCREEN_HEIGHT * 0.6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  grabHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.colors.textLight,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    opacity: 0.5,
  },
  bottomSheetContent: {
    // paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  bookingRow: {
    paddingHorizontal: theme.spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.lg,
  },
  bookingIdSection: {
    flex: 1,
  },
  bookingLabel: {

    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    marginBottom: theme.spacing.xs,
  },
  bookingId: {
    ...theme.typography.h2,
    color: theme.colors.textLight,
    fontWeight: "bold",
  },
  statusSection: {
    alignItems: "flex-end",
  },
  statusLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    marginBottom: theme.spacing.xs,
  },
  statusBadge: {
    backgroundColor: "#333333",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.pill,
  },
  statusBadgeText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textLight,
    fontWeight: "600",
  },
  progressWrapper: {
    marginVertical: theme.spacing.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: theme.spacing.md,
    width: "100%",
  },
  progressStep: {
    zIndex: 2,
    position: "relative",
    alignItems: "center",
    justifyContent: "flex-start",
    minWidth: 60,
    flex: 1,
  },
  progressCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#333333",
    borderWidth: 2,
    borderColor: "#333333",
    justifyContent: "center",
    alignItems: "center",
    alignSelf: "center",
    marginBottom: theme.spacing.sm,
  },
  progressCircleCompleted: {
    backgroundColor: "#4CAF50",
    borderColor: "#4CAF50",
  },
  progressCheck: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  progressConnector: {
    flex: 1,
    height: 2,
    backgroundColor: "#666666",
    marginHorizontal: theme.spacing.xs,
    marginTop: 19,
    opacity: 0.5,
    alignSelf: "flex-start",
  },
  progressLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    textAlign: "center",
    fontSize: 12,
    marginTop: 4,
  },
  progressLabelCompleted: {
    color: "#FFFFFF",
    opacity: 1,
  },
  progressConnectorCompleted: {
    backgroundColor: "#4CAF50",
    opacity: 1,
  },
  datesRow: {
    paddingHorizontal: theme.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: theme.spacing.lg,
  },
  dateSectionLeft: {
    flex: 1,
    alignItems: "flex-start",
  },
  dateSectionRight: {
    flex: 1,
    alignItems: "flex-end",
  },
  dateLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    marginBottom: theme.spacing.xs,
    textAlign: "left",
  },
  dateLabelRight: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    marginBottom: theme.spacing.xs,
    textAlign: "right",
  },
  locationText: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    fontWeight: "bold",
  },
  locationTextLeft: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    fontWeight: "bold",
    textAlign: "left",
  },
  locationTextRight: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    fontWeight: "bold",
    textAlign: "right",
  },
  detailsRow: {
    // display: 'none',
    paddingHorizontal: theme.spacing.md,
    flexDirection: "row",
    marginBottom: theme.spacing.lg,
    position: "relative",
  },
  detailsLeft: {
    flex: 1,
    marginRight: theme.spacing.md,
    alignItems: "flex-start",
  },
  detailsRight: {
    flex: 1,
    alignItems: "flex-start",
    marginLeft: theme.spacing.md,
  },
  detailItem: {
    marginBottom: theme.spacing.md,
  },
  detailItemRight: {
    marginBottom: theme.spacing.md,
    alignItems: "flex-start",
    width: "100%",
  },
  detailLabel: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
    marginBottom: theme.spacing.xs,
  },
  detailValue: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    fontWeight: "bold",
  },
  detailLabelRight: {
    textAlign: "right",
  },
  detailValueRight: {
    textAlign: "right",
  },
  packageImageContainer: {
    position: "relative",
    right: 0,
    left: 50,
    top: 0,
    alignItems: "flex-end",
    justifyContent: "flex-start",
    width: 100,
    height: "100%",
  },
  packageImage: {
    width: 140,
    height: 160,
    paddingLeft: 0,
  },
  togglesSection: {
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  toggleLabel: {
    ...theme.typography.body,
    color: theme.colors.textLight,
  },
  courierSectionOverflow: {
    // display: "none",
    position: "absolute",
    bottom: 20,
    left: theme.spacing.sm,
    right: theme.spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.primaryDark,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 10,
  },
  courierSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  courierInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  courierAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: theme.colors.secondary,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  courierAvatarText: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    fontWeight: "bold",
  },
  courierDetails: {
    flex: 1,
  },
  courierName: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    fontWeight: "bold",
    marginBottom: theme.spacing.xs,
  },
  courierRole: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.7,
  },
  courierActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
  },
  courierButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#FF6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  courierButtonSecondary: {
    backgroundColor: theme.colors.textLight,
  },
  courierButtonIcon: {
    fontSize: 20,
  },
  courierButtonIconSecondary: {
    fontSize: 20,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: theme.colors.textLight,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: theme.colors.textLight,
    textAlign: "center",
    marginBottom: 20,
    opacity: 0.7,
  },
  retryButton: {
    backgroundColor: theme.colors.secondary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: theme.colors.textLight,
    fontSize: 16,
    fontWeight: "600",
  },
});

export default OrderDetailsScreen;
