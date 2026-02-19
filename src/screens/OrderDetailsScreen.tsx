import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Image,
  Platform,
  Dimensions,
  Animated,
  PanResponder,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons, FontAwesome5, Entypo } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import {
  getOrderDetails,
  updateOrderStatus,
  syncShopifyOrderToFirestore,
} from "../services/orderService";
import LoadingScreen from "../components/LoadingScreen";
import {
  markOrderAsPickedUp,
  markOrderAsInProgress,
  markOrderAsDelivered,
  markCodOrderAsPaid,
  updateDeliveryStatus,
  getDeliveryStatusFromMetafield,
  getShopifyOrderById,
  syncDeliveryStatusFromExistingTags,
} from "../services/shopifyService";
import {
  WAREHOUSE_ADDRESS,
  DARK_STORE_LOCATION,
  GOOGLE_MAP_API,
} from "../config/config";
import DeliverySuccessScreen from "../components/DeliverySuccessScreen";
import { theme } from "../config/theme";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

import {
  useNavigation,
  useRoute,
  RouteProp,
  useFocusEffect,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAppContext } from "../context/AppContext";
import { RootStackParamList } from "../navigation/RootNavigator";

type OrderDetailsScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "OrderDetails"
>;
type OrderDetailsScreenRouteProp = RouteProp<
  RootStackParamList,
  "OrderDetails"
>;

const OrderDetailsScreen: React.FC = () => {
  const { phoneNumber } = useAppContext();
  const navigation = useNavigation<OrderDetailsScreenNavigationProp>();
  const route = useRoute<OrderDetailsScreenRouteProp>();
  const { orderId } = route.params;

  const onBack = () => navigation.goBack();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPickedUp, setIsPickedUp] = useState(false);
  const [isInProgress, setIsInProgress] = useState(false);
  const [isDelivered, setIsDelivered] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [currentDeliveryStatus, setCurrentDeliveryStatus] = useState<
    string | null
  >(null);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [destinationCoords, setDestinationCoords] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [mapType, setMapType] = useState<"standard" | "satellite">("standard");
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  const [isBottomSheetCollapsed, setIsBottomSheetCollapsed] = useState(true); // Start collapsed
  const [isContactExpanded, setIsContactExpanded] = useState(false); // Contact section collapsed by default
  const bottomSheetHeight = useRef(
    new Animated.Value(120), // Start with collapsed height
  ).current;
  const dragY = useRef(120);

  const COLLAPSED_HEIGHT = 120; // Reduced height for minimal dropdown
  const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.6;
  const CONTACT_BAR_BOTTOM = 12 + insets.bottom;

  // PanResponder for drawer effect
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical movements
        return (
          Math.abs(gestureState.dy) > 5 &&
          Math.abs(gestureState.dy) > Math.abs(gestureState.dx)
        );
      },
      onPanResponderGrant: () => {
        // Store current height when drag starts
        bottomSheetHeight.stopAnimation((value) => {
          dragY.current = value;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        // Calculate new height based on drag (dragging down decreases height)
        const newHeight = dragY.current - gestureState.dy;

        // Clamp between min and max heights
        const clampedHeight = Math.max(
          COLLAPSED_HEIGHT,
          Math.min(EXPANDED_HEIGHT, newHeight),
        );

        bottomSheetHeight.setValue(clampedHeight);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentHeight = dragY.current - gestureState.dy;
        const velocity = gestureState.vy;

        // Determine target state based on position and velocity
        const threshold = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
        const shouldCollapse =
          (currentHeight < threshold && Math.abs(velocity) < 0.3) ||
          velocity > 0.3 ||
          currentHeight < COLLAPSED_HEIGHT + 80;

        const targetHeight = shouldCollapse
          ? COLLAPSED_HEIGHT
          : EXPANDED_HEIGHT;
        const willBeCollapsed = targetHeight === COLLAPSED_HEIGHT;

        Animated.spring(bottomSheetHeight, {
          toValue: targetHeight,
          useNativeDriver: false,
          tension: 50,
          friction: 10,
        }).start();

        setIsBottomSheetCollapsed(willBeCollapsed);
        dragY.current = targetHeight;
      },
    }),
  ).current;

  useFocusEffect(
    useCallback(() => {
      loadOrderDetails();
    }, [orderId]),
  );

  const loadOrderDetails = async () => {
    try {
      setLoading(true);
      setError(null);

      // Step 1: Try to get from Firestore first
      let result = await getOrderDetails(orderId);
      let orderData = result.data;

      // Step 2: If not found in Firestore, fetch from Shopify and sync
      if (!result.success || !result.data) {
        console.log(
          `[Order Details] Order not in Firestore, fetching from Shopify: ${orderId}`,
        );
        const shopifyResult = await getShopifyOrderById(orderId);

        if (shopifyResult.success && shopifyResult.data) {
          // Sync to Firestore for future use
          await syncShopifyOrderToFirestore(shopifyResult.data);

          // Fetch again from Firestore now that it's synced
          result = await getOrderDetails(orderId);

          if (!result.success || !result.data) {
            setError("Failed to sync order to Firestore");
            return;
          }
          orderData = result.data;
        } else {
          setError(shopifyResult.error || "Order not found in Shopify");
          return;
        }
      }

      if (result.success && result.data) {
        setOrder(result.data);
        const status = (result.data as any).status || "PENDING";
        setIsPickedUp(
          status === "PICKED_UP" ||
            status === "IN_TRANSIT" ||
            status === "DELIVERED",
        );
        setIsInProgress(status === "IN_TRANSIT" || status === "DELIVERED");
        setIsDelivered(status === "DELIVERED");

        // Geocode customer address for map
        await geocodeCustomerAddress(result.data);

        // Get current delivery status from Shopify metafield
        const shopifyOrderId = (result.data as any).shopifyOrderId || orderId;
        const deliveryStatusResult =
          await getDeliveryStatusFromMetafield(shopifyOrderId);
        if (
          deliveryStatusResult.success &&
          deliveryStatusResult.data?.deliveryStatus
        ) {
          setCurrentDeliveryStatus(deliveryStatusResult.data.deliveryStatus);
          console.log(
            `✅ [Order Details] Current delivery status from Shopify: ${deliveryStatusResult.data.deliveryStatus}`,
          );
        } else {
          // If delivery status column is empty, try to sync from tags
          console.log(
            `⚠️ [Order Details] Delivery status column is empty, attempting to sync from tags...`,
          );
          const syncResult =
            await syncDeliveryStatusFromExistingTags(shopifyOrderId);
          if (
            syncResult.success &&
            syncResult.data?.synced &&
            syncResult.data?.status
          ) {
            setCurrentDeliveryStatus(syncResult.data.status);
            console.log(
              `✅ [Order Details] Successfully synced delivery status from tags: ${syncResult.data.status}`,
            );
          } else {
            console.warn(
              `⚠️ [Order Details] Could not sync delivery status from tags:`,
              syncResult.error || "No delivery status found in tags",
            );
          }
        }
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

  // Geocode customer address to get coordinates
  const geocodeCustomerAddress = async (orderData: any) => {
    try {
      const shopifyData = orderData.shopifyData || {};
      const shippingAddress = shopifyData.shippingAddress || {};

      if (!shippingAddress.address1) {
        console.warn("No shipping address found");
        return;
      }

      // Build full address string
      const addressParts = [
        shippingAddress.address1,
        shippingAddress.address2,
        shippingAddress.city,
        shippingAddress.province,
        shippingAddress.zip,
        shippingAddress.country,
      ].filter(Boolean);

      const fullAddress = addressParts.join(", ");

      // Use Google Geocoding API
      const encodedAddress = encodeURIComponent(fullAddress);
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_MAP_API}`;

      const response = await fetch(geocodeUrl);
      const data = await response.json();

      if (data.status === "OK" && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = {
          latitude: location.lat,
          longitude: location.lng,
        };
        setDestinationCoords(coords);

        // Fit map to show both origin and destination
        if (mapRef.current) {
          const coordinates = [DARK_STORE_LOCATION, coords];
          mapRef.current.fitToCoordinates(coordinates, {
            edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
            animated: true,
          });
        }
      } else {
        console.warn("Geocoding failed:", data.status);
      }
    } catch (error) {
      console.error("Error geocoding address:", error);
    }
  };

  // Calculate region for map to show both origin and destination
  const getMapRegion = () => {
    const origin = DARK_STORE_LOCATION;
    const destination = destinationCoords;

    if (!destination) {
      return {
        latitude: origin.latitude,
        longitude: origin.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    const minLat = Math.min(origin.latitude, destination.latitude);
    const maxLat = Math.max(origin.latitude, destination.latitude);
    const minLng = Math.min(origin.longitude, destination.longitude);
    const maxLng = Math.max(origin.longitude, destination.longitude);

    const latDelta = (maxLat - minLat) * 1.5;
    const lngDelta = (maxLng - minLng) * 1.5;

    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(latDelta, 0.01),
      longitudeDelta: Math.max(lngDelta, 0.01),
    };
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
      console.error("Error opening maps:", err),
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

      // Get Shopify order ID - prefer shopifyOrderId from order, fallback to orderId
      // shopifyOrderId should be in GID format: gid://shopify/Order/123456789
      let shopifyOrderId = (order as any).shopifyOrderId;
      if (!shopifyOrderId) {
        // If orderId is numeric, convert to GID format
        if (/^\d+$/.test(orderId)) {
          shopifyOrderId = `gid://shopify/Order/${orderId}`;
        } else {
          shopifyOrderId = orderId;
        }
      }
      console.log(
        `[Status Update] Updating PICKED_UP for Shopify order: ${shopifyOrderId}`,
      );
      console.log(`[Status Update] Order object:`, {
        shopifyOrderId: (order as any).shopifyOrderId,
        orderId,
        shopifyOrderName: (order as any).shopifyOrderName,
      });

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
              const errorMsg =
                deliveryStatusResult.status === "rejected"
                  ? deliveryStatusResult.reason?.message ||
                    String(deliveryStatusResult.reason)
                  : deliveryStatusResult.value.error || "Unknown error";
              errors.push(`Delivery status: ${errorMsg}`);
              console.error(
                `[Shopify Update] Failed to update delivery status:`,
                errorMsg,
              );
            } else if (
              deliveryStatusResult.status === "fulfilled" &&
              deliveryStatusResult.value.success
            ) {
              console.log(
                `[Shopify Update] ✅ Successfully updated delivery status to PICKED_UP`,
              );
            }

            if (
              shopifyResult.status === "rejected" ||
              (shopifyResult.status === "fulfilled" &&
                !shopifyResult.value.success)
            ) {
              const errorMsg =
                shopifyResult.status === "rejected"
                  ? shopifyResult.reason?.message ||
                    String(shopifyResult.reason)
                  : shopifyResult.value.error || "Unknown error";
              errors.push(`Tag: ${errorMsg}`);
              console.error(
                `[Shopify Update] Failed to update order tag:`,
                errorMsg,
              );
            } else if (
              shopifyResult.status === "fulfilled" &&
              shopifyResult.value.success
            ) {
              console.log(`[Shopify Update] ✅ Successfully updated order tag`);
            }

            if (errors.length > 0) {
              console.warn(
                "[Shopify Update] Some Shopify updates failed:",
                errors,
              );
              Alert.alert(
                "Shopify Update Warning",
                `Some updates failed:\n${errors.join("\n")}\n\nOrder status updated locally.`,
              );
            }
            return { errors, success: errors.length === 0 };
          })()
        : Promise.resolve({ errors: [], success: true });

      const firestoreUpdate = updateOrderStatus(orderId, newStatus);
      const [shopifyResult, firestoreResult] = await Promise.allSettled([
        shopifyUpdates,
        firestoreUpdate,
      ]);

      // Refresh delivery status from Shopify after update
      try {
        const deliveryStatusResult =
          await getDeliveryStatusFromMetafield(shopifyOrderId);
        if (deliveryStatusResult.success && deliveryStatusResult.data) {
          setCurrentDeliveryStatus(deliveryStatusResult.data.deliveryStatus);
          console.log(
            `✅ [Order Details] Refreshed delivery status: ${deliveryStatusResult.data.deliveryStatus || "Not set"}`,
          );
        }
      } catch (err) {
        console.warn("Failed to refresh delivery status:", err);
      }

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
          : "Order status updated",
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

      // Get Shopify order ID - prefer shopifyOrderId from order, fallback to orderId
      // shopifyOrderId should be in GID format: gid://shopify/Order/123456789
      let shopifyOrderId = (order as any).shopifyOrderId;
      if (!shopifyOrderId) {
        // If orderId is numeric, convert to GID format
        if (/^\d+$/.test(orderId)) {
          shopifyOrderId = `gid://shopify/Order/${orderId}`;
        } else {
          shopifyOrderId = orderId;
        }
      }
      console.log(
        `[Status Update] Updating IN_TRANSIT for Shopify order: ${shopifyOrderId}`,
      );
      console.log(`[Status Update] Order object:`, {
        shopifyOrderId: (order as any).shopifyOrderId,
        orderId,
        shopifyOrderName: (order as any).shopifyOrderName,
      });

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
              const errorMsg =
                deliveryStatusResult.status === "rejected"
                  ? deliveryStatusResult.reason?.message ||
                    String(deliveryStatusResult.reason)
                  : deliveryStatusResult.value.error || "Unknown error";
              errors.push(`Delivery status: ${errorMsg}`);
              console.error(
                `[Shopify Update] Failed to update delivery status:`,
                errorMsg,
              );
            } else if (
              deliveryStatusResult.status === "fulfilled" &&
              deliveryStatusResult.value.success
            ) {
              console.log(
                `[Shopify Update] ✅ Successfully updated delivery status to IN_TRANSIT`,
              );
            }

            if (
              shopifyResult.status === "rejected" ||
              (shopifyResult.status === "fulfilled" &&
                !shopifyResult.value.success)
            ) {
              const errorMsg =
                shopifyResult.status === "rejected"
                  ? shopifyResult.reason?.message ||
                    String(shopifyResult.reason)
                  : shopifyResult.value.error || "Unknown error";
              errors.push(`Tag: ${errorMsg}`);
              console.error(
                `[Shopify Update] Failed to update order tag:`,
                errorMsg,
              );
            } else if (
              shopifyResult.status === "fulfilled" &&
              shopifyResult.value.success
            ) {
              console.log(`[Shopify Update] ✅ Successfully updated order tag`);
            }

            if (errors.length > 0) {
              console.warn(
                "[Shopify Update] Some Shopify updates failed:",
                errors,
              );
              Alert.alert(
                "Shopify Update Warning",
                `Some updates failed:\n${errors.join("\n")}\n\nOrder status updated locally.`,
              );
            }
            return { errors, success: errors.length === 0 };
          })()
        : Promise.resolve({ errors: [], success: true });

      const firestoreUpdate = updateOrderStatus(orderId, newStatus);
      const [shopifyResult, firestoreResult] = await Promise.allSettled([
        shopifyUpdates,
        firestoreUpdate,
      ]);

      // Refresh delivery status from Shopify after update
      try {
        const deliveryStatusResult =
          await getDeliveryStatusFromMetafield(shopifyOrderId);
        if (deliveryStatusResult.success && deliveryStatusResult.data) {
          setCurrentDeliveryStatus(deliveryStatusResult.data.deliveryStatus);
          console.log(
            `✅ [Order Details] Refreshed delivery status: ${deliveryStatusResult.data.deliveryStatus || "Not set"}`,
          );
        }
      } catch (err) {
        console.warn("Failed to refresh delivery status:", err);
      }

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
        value ? "Order marked as in progress" : "Order status updated",
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

      // Get Shopify order ID - prefer shopifyOrderId from order, fallback to orderId
      const shopifyOrderId = (order as any).shopifyOrderId || orderId;
      console.log(
        `[Status Update] Updating DELIVERED for Shopify order: ${shopifyOrderId}`,
      );

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
              const errorMsg =
                deliveryStatusResult.status === "rejected"
                  ? deliveryStatusResult.reason?.message ||
                    String(deliveryStatusResult.reason)
                  : deliveryStatusResult.value.error || "Unknown error";
              updateErrors.push(`Delivery status: ${errorMsg}`);
              console.error(
                `[Shopify Update] Failed to update delivery status:`,
                errorMsg,
              );
            } else if (
              deliveryStatusResult.status === "fulfilled" &&
              deliveryStatusResult.value.success
            ) {
              console.log(
                `[Shopify Update] ✅ Successfully updated delivery status to DELIVERED`,
              );
            }

            if (
              shopifyTagResult.status === "rejected" ||
              (shopifyTagResult.status === "fulfilled" &&
                !shopifyTagResult.value.success)
            ) {
              const errorMsg =
                shopifyTagResult.status === "rejected"
                  ? shopifyTagResult.reason?.message ||
                    String(shopifyTagResult.reason)
                  : shopifyTagResult.value.error || "Unknown error";
              updateErrors.push(`Tag: ${errorMsg}`);
              console.error(
                `[Shopify Update] Failed to update order tag:`,
                errorMsg,
              );
            } else if (
              shopifyTagResult.status === "fulfilled" &&
              shopifyTagResult.value.success
            ) {
              console.log(`[Shopify Update] ✅ Successfully updated order tag`);
            }

            if (
              paidResult.status === "rejected" ||
              (paidResult.status === "fulfilled" && !paidResult.value.success)
            ) {
              const errorMsg =
                paidResult.status === "rejected"
                  ? paidResult.reason?.message || String(paidResult.reason)
                  : paidResult.value.error || "Unknown error";
              updateErrors.push(`Payment: ${errorMsg}`);
              console.error(
                `[Shopify Update] Failed to mark COD as paid:`,
                errorMsg,
              );
            } else if (
              paidResult.status === "fulfilled" &&
              paidResult.value.success
            ) {
              console.log(
                `[Shopify Update] ✅ Successfully marked COD as paid`,
              );
            }

            if (updateErrors.length > 0) {
              console.warn(
                "[Shopify Update] Some Shopify updates failed:",
                updateErrors,
              );
              Alert.alert(
                "Shopify Update Warning",
                `Some updates failed:\n${updateErrors.join("\n")}\n\nOrder status updated locally.`,
              );
            } else {
              console.log(
                `[Shopify Update] ✅ All Shopify updates completed successfully`,
              );
            }

            return { errors: updateErrors };
          })()
        : Promise.resolve({ errors: [] });

      const firestoreUpdate = updateOrderStatus(orderId, newStatus);
      const [shopifyResult, firestoreResult] = await Promise.allSettled([
        shopifyUpdates,
        firestoreUpdate,
      ]);

      // Refresh delivery status from Shopify after update
      try {
        const deliveryStatusResult =
          await getDeliveryStatusFromMetafield(shopifyOrderId);
        if (deliveryStatusResult.success && deliveryStatusResult.data) {
          setCurrentDeliveryStatus(deliveryStatusResult.data.deliveryStatus);
          console.log(
            `✅ [Order Details] Refreshed delivery status: ${deliveryStatusResult.data.deliveryStatus || "Not set"}`,
          );
        }
      } catch (err) {
        console.warn("Failed to refresh delivery status:", err);
      }

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
            shopifyErrors,
          );
        }
      } else {
        if (shopifyErrors.length > 0) {
          Alert.alert("Success", "Order status updated", undefined, {
            cancelable: true,
          });
          console.warn(
            "Order updated but some Shopify updates failed:",
            shopifyErrors,
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

  // Get customer phone number
  const customerPhone = shippingAddress?.phone;

  const handleCallCustomer = () => {
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
        "Unable to make phone call. Please check if your device supports phone calls.",
      );
    });
  };

  const toggleBottomSheet = () => {
    const toValue = isBottomSheetCollapsed ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;

    Animated.spring(bottomSheetHeight, {
      toValue,
      useNativeDriver: false,
      tension: 50,
      friction: 10,
    }).start();

    setIsBottomSheetCollapsed(!isBottomSheetCollapsed);
    dragY.current = toValue;
  };

  const toggleContactExpansion = () => {
    setIsContactExpanded(!isContactExpanded);
  };

  const handleMessage = (phoneNumber: string) => {
    Linking.openURL(`sms:${phoneNumber}`).catch(() => {
      Alert.alert("Error", "Unable to open messaging app");
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
    orderStatus,
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

  // Get customer name (support both camelCase and REST API snake_case)
  const firstName =
    shippingAddress.firstName ?? (shippingAddress as any).first_name ?? "";
  const lastName =
    shippingAddress.lastName ?? (shippingAddress as any).last_name ?? "";
  const customerName =
    [firstName, lastName].filter(Boolean).join(" ").trim() || "Customer";

  // Calculate total quantity and weight (placeholder)
  const totalQuantity = lineItems.reduce(
    (sum: number, item: any) => sum + (item.node?.quantity || 0),
    0,
  );
  const totalWeight = `${totalQuantity * 2} Kg`; // Placeholder calculation

  // Get status display
  const getStatusDisplay = () => {
    switch (orderStatus) {
      case "ASSIGNED":
        return "Assigned";
      case "PICKED_UP":
        return "Picked Up";
      case "IN_TRANSIT":
        return "In Transit";
      case "DELIVERED":
        return "Delivered";
      case "RETURNED":
        return "Returned";
      default:
        return "Assigned";
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Top Header with Back Button, Order ID, and Map Button */}
      <View style={[styles.topHeader, { top: insets.top + 10 }]}>
        <TouchableOpacity onPress={onBack} style={styles.headerCircleButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
        </TouchableOpacity>

        <View style={styles.orderIdPill}>
          <Text style={styles.orderIdText}>
            {order?.shopifyOrderName || orderId?.slice(-4) || "Order"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            const scheme = Platform.select({ ios: "maps:", android: "geo:" });
            const url = Platform.select({
              ios: `maps:0,0?q=${order?.shopifyData?.shippingAddress?.address1}`,
              android: `geo:0,0?q=${order?.shopifyData?.shippingAddress?.address1}`,
            });
            if (url) Linking.openURL(url);
          }}
          style={styles.headerCircleButton}
        >
          <Ionicons name="map-outline" size={24} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Map View */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={getMapRegion()}
          mapType={mapType}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          showsScale={false}
          toolbarEnabled={false}
          onMapReady={() => {
            if (destinationCoords && mapRef.current) {
              const coordinates = [DARK_STORE_LOCATION, destinationCoords];
              mapRef.current.fitToCoordinates(coordinates, {
                edgePadding: { top: 100, right: 50, bottom: 300, left: 50 },
                animated: true,
              });
            }
          }}
        >
          {/* Origin Marker (Warehouse) */}
          <Marker
            coordinate={DARK_STORE_LOCATION}
            title="Warehouse"
            description="Pickup Location"
            pinColor={theme.colors.success}
          >
            <View style={styles.markerContainer}>
              <View
                style={[
                  styles.markerCircle,
                  { backgroundColor: theme.colors.success },
                ]}
              >
                <Text style={styles.markerEmoji}>🏠</Text>
              </View>
            </View>
          </Marker>

          {/* Destination Marker (Customer) */}
          {destinationCoords && (
            <>
              <Marker
                coordinate={destinationCoords}
                title="Delivery Address"
                description={
                  order?.shopifyData?.shippingAddress?.address1 ||
                  "Customer Location"
                }
                pinColor="#FF6B35"
              >
                <View style={styles.markerContainer}>
                  <View
                    style={[
                      styles.markerCircle,
                      { backgroundColor: "#FF6B35" },
                    ]}
                  >
                    <Text style={styles.markerEmoji}>📍</Text>
                  </View>
                </View>
              </Marker>

              {/* Route Line */}
              <Polyline
                coordinates={[DARK_STORE_LOCATION, destinationCoords]}
                strokeColor={theme.colors.success}
                strokeWidth={4}
                lineDashPattern={[]}
              />
            </>
          )}
        </MapView>
      </View>

      {/* Bottom Sheet */}
      <Animated.View
        style={[
          styles.bottomSheet,
          {
            height: bottomSheetHeight,
            maxHeight: bottomSheetHeight,
          },
        ]}
      >
        {/* Handle bar - always visible; draggable when expanded */}
        <View style={styles.grabHandleContainer} {...panResponder.panHandlers}>
          <TouchableOpacity
            onPress={toggleBottomSheet}
            activeOpacity={0.8}
            style={styles.grabHandleTouchable}
          >
            <View style={styles.grabHandle} />
          </TouchableOpacity>
        </View>

        {isBottomSheetCollapsed ? (
          // Collapsed View - Minimal Content (Dropdown)
          <View style={styles.collapsedContent} {...panResponder.panHandlers}>
            <TouchableOpacity activeOpacity={1} onPress={toggleBottomSheet}>
              <View style={styles.collapsedRow}>
                <View
                  style={[styles.collapsedLeft, { justifyContent: "center" }]}
                >
                  <Text style={styles.bookingLabel}>Customer</Text>
                  <Text style={styles.collapsedBookingId} numberOfLines={1}>
                    {customerName || "Customer"}
                  </Text>
                </View>
                <View style={styles.collapsedRight}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <TouchableOpacity
                      style={[
                        styles.courierButton,
                        {
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          marginRight: 10,
                          backgroundColor: theme.colors.success,
                        },
                      ]}
                      onPress={handleCallCustomer}
                    >
                      <FontAwesome5 name="phone-alt" size={18} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.courierButton,
                        styles.courierButtonSecondary,
                        { width: 40, height: 40, borderRadius: 20 },
                      ]}
                      onPress={() =>
                        customerPhone && handleMessage(customerPhone)
                      }
                    >
                      <Entypo name="message" size={20} color="black" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        ) : (
          // Expanded View - Full Content
          <ScrollView
            style={styles.bottomSheetContent}
            contentContainerStyle={styles.bottomSheetContentContainer}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled={true}
            bounces={true}
          >
            {/* Booking ID and Status */}
            {/* Customer Name and Contact Options */}
            <View style={styles.bookingRow}>
              <View style={styles.bookingIdSection}>
                <Text style={styles.bookingId} numberOfLines={1}>
                  {customerName || "Customer"}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    marginTop: 4,
                  }}
                >
                  <Ionicons
                    name="location-outline"
                    size={16}
                    color={theme.colors.textLight}
                    style={{ opacity: 0.7, marginRight: 4, marginTop: 2 }}
                  />
                  <Text
                    style={[
                      theme.typography.body,
                      {
                        color: theme.colors.textLight,
                        opacity: 0.9,
                        flex: 1,
                        fontSize: 13,
                        lineHeight: 18,
                      },
                    ]}
                  >
                    {[
                      shippingAddress.address1,
                      shippingAddress.address2,
                      shippingAddress.city,
                      shippingAddress.province,
                      shippingAddress.zip,
                      shippingAddress.country,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <TouchableOpacity
                  style={[
                    styles.courierButton,
                    {
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      marginRight: 10,
                      backgroundColor: theme.colors.success,
                    },
                  ]}
                  onPress={handleCallCustomer}
                >
                  <FontAwesome5 name="phone-alt" size={18} color="white" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.courierButton,
                    styles.courierButtonSecondary,
                    { width: 40, height: 40, borderRadius: 20 },
                  ]}
                  onPress={() => customerPhone && handleMessage(customerPhone)}
                >
                  <Entypo name="message" size={20} color="black" />
                </TouchableOpacity>
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
                      <Text
                        style={[
                          styles.progressLabel,
                          step.completed && styles.progressLabelCompleted,
                        ]}
                        numberOfLines={1}
                      >
                        {index === 0
                          ? "Assigned"
                          : index === 1
                            ? "Picked Up"
                            : index === 2
                              ? "In Progress"
                              : "Delivered"}
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

            <View style={styles.progressSeparator} />

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
                          totalPrice.currencyCode || "$",
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
          </ScrollView>
        )}
      </Animated.View>

      {/* Customer Contact Section - above safe area */}
      {/* Customer Contact Section - Sticky footer when expanded */}
    </View>
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
  topHeader: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingTop: theme.spacing.md,
    backgroundColor: "transparent",
    zIndex: 1000,
  },
  headerCircleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  orderIdPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  orderIdText: {
    ...theme.typography.h3,
    color: theme.colors.primary,
    fontWeight: "bold",
    fontSize: 16,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: "#E8E8E8",
    position: "relative",
    // zIndex: -1,
  },
  map: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    alignItems: "center",
  },
  mapLoadingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F5F5",
  },
  mapLoadingText: {
    marginTop: 10,
    color: "#666",
    fontSize: 14,
  },
  markerContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  markerCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerEmoji: {
    fontSize: 20,
  },
  mapTypeSelector: {
    flexDirection: "row",
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  mapTypeButton: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm + 2,
    backgroundColor: "transparent",
  },
  mapTypeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  mapTypeButtonText: {
    ...theme.typography.body,
    color: "#666",
    fontWeight: "600",
  },
  mapTypeButtonTextActive: {
    color: theme.colors.textLight,
    fontWeight: "bold",
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
    bottom: Platform.OS === "android" ? -12 : 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.primaryDark,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 12,
    overflow: "hidden",
  },
  grabHandleContainer: {
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  grabHandleTouchable: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  grabHandle: {
    width: 36,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 2,
  },
  collapsedContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    paddingTop: 0,
    flex: 1,
  },
  collapsedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  collapsedLeft: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  collapsedRight: {
    alignItems: "flex-end",
  },
  collapsedBookingId: {
    ...theme.typography.h3,
    color: theme.colors.textLight,
    fontWeight: "bold",
    marginBottom: theme.spacing.xs,
  },
  collapsedCustomer: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    opacity: 0.8,
  },
  expandHint: {
    ...theme.typography.caption,
    color: theme.colors.textLight,
    opacity: 0.6,
    marginTop: theme.spacing.xs,
    fontSize: 10,
  },
  bottomSheetContent: {
    flex: 1,
  },
  bottomSheetContentContainer: {
    // display: "none",
    paddingHorizontal: theme.spacing.xs,
    paddingBottom: theme.spacing.xl,
  },
  bookingRow: {
    paddingHorizontal: theme.spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing.xs,
  },
  bookingIdSection: {
    flex: 1,
  },
  bookingLabel: {
    textAlign: "left",
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
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.pill,
  },
  statusBadgeText: {
    ...theme.typography.bodySmall,
    color: theme.colors.textLight,
    fontWeight: "600",
  },
  deliveryStatusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.backgroundDark,
    borderRadius: theme.borderRadius.md,
    marginHorizontal: theme.spacing.xs,
  },
  deliveryStatusLabel: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    fontWeight: "500",
  },
  deliveryStatusBadge: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  deliveryStatusText: {
    ...theme.typography.body,
    color: theme.colors.textLight,
    fontWeight: "600",
    fontSize: 12,
  },
  progressWrapper: {
    marginVertical: theme.spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: theme.spacing.sm,
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

  // Inline Contact Section Styles (within bottom sheet)
  inlineContactSection: {
    marginTop: 20,
    marginHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E0E0E0",
  },
  inlineContactToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
  },
  inlineContactToggleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  inlineContactToggleText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  inlineContactDetails: {
    marginTop: 12,
    padding: 16,
    backgroundColor: "#F5F5F5",
    borderRadius: 12,
  },
  inlineCustomerInfo: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  inlineCustomerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#4CAF50",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  inlineCustomerAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  inlineCustomerTextInfo: {
    flex: 1,
  },
  inlineCustomerName: {
    color: "#000",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  inlineCustomerPhone: {
    color: "#666",
    fontSize: 13,
  },
  inlineContactActions: {
    flexDirection: "row",
    gap: 12,
  },
  inlineContactActionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  inlineContactActionText: {
    color: "#4CAF50",
    fontSize: 14,
    fontWeight: "600",
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
  progressSeparator: {
    height: 2,
    backgroundColor: "#333333",
    marginVertical: theme.spacing.sm,
  },

  datesRow: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
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
    paddingHorizontal: theme.spacing.sm,
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
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.primaryDark,
    padding: theme.spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 10,
  },
  courierSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "#333333",
  },
  courierInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  courierAvatar: {
    width: 40,
    height: 40,
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
  courierSectionButton: {
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.colors.primaryDark,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 10,
  },
  expandIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: theme.spacing.sm,
  },
  expandIconText: {
    fontSize: 18,
    color: theme.colors.textLight,
    fontWeight: "bold",
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
