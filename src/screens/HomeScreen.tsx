import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { PickerDetails } from './PickerDetailsScreen';
import { fetchOrders, ShopifyOrder } from '../services/shopifyService';
import {
  syncShopifyOrderToFirestore,
  assignOrderToRider,
  isOrderAssigned,
} from '../services/orderService';
import { startLocationTracking } from '../services/locationService';
import LoadingScreen from '../components/LoadingScreen';
import { theme } from '../config/theme';

interface HomeScreenProps {
  phoneNumber?: string;
  pickerDetails?: PickerDetails | null;
  onOrderSelect?: (orderId: string) => void;
  onOrderPicked?: (orderId: string) => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({
  phoneNumber,
  pickerDetails,
  onOrderSelect,
  onOrderPicked,
}) => {
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickingOrderId, setPickingOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const userName = pickerDetails?.fullName?.split(' ')[0] || 'Partner';
  const userLocation = 'Location';

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async (refresh = false) => {
    try {
      refresh ? setRefreshing(true) : setLoading(true);
      setError(null);

      const res = await fetchOrders(20);
      if (!res.success || !res.data) throw new Error(res.error);

      const nodes = res.data.orders.edges
        .map((e) => e.node)
        .filter(
          (o) =>
            o.displayFulfillmentStatus !== 'FULFILLED' &&
            o.displayFulfillmentStatus !== 'DELIVERED'
        );

      const unassigned: ShopifyOrder[] = [];
      for (const o of nodes) {
        const assigned = await isOrderAssigned(o.id);
        if (!assigned) unassigned.push(o);
      }

      setOrders(unassigned);
    } catch (e: any) {
      setError(e.message || 'Failed to load orders');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredOrders = orders.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.name?.toLowerCase().includes(q) ||
      o.shippingAddress?.address1?.toLowerCase().includes(q) ||
      o.shippingAddress?.city?.toLowerCase().includes(q)
    );
  });

  const handlePickOrder = async (order: ShopifyOrder) => {
    if (!phoneNumber) {
      Alert.alert('Login required');
      return;
    }

    setPickingOrderId(order.id);
    try {
      await syncShopifyOrderToFirestore(order);
      const riderId = phoneNumber.replace(/\D/g, '');
      const res = await assignOrderToRider(order.id, riderId);

      if (!res.success) throw new Error(res.error);

      await startLocationTracking(riderId);
      onOrderPicked?.(order.id);
    } catch (e: any) {
      Alert.alert('Error', e.message);
      setPickingOrderId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <StatusBar style="light" />

      {/* ================= HEADER ================= */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {pickerDetails?.profilePhoto ? (
            <Image source={{ uri: pickerDetails.profilePhoto }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{userName[0]}</Text>
            </View>
          )}

          <View>
            <Text style={styles.greeting}>Hey {userName}</Text>
            <View style={styles.locationRow}>
              <Ionicons name="location" size={14} color={theme.colors.success} />
              <Text style={styles.location}>{userLocation}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.notify}>
          <Ionicons name="notifications-outline" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* ================= SEARCH ================= */}
      <View style={styles.searchWrapper}>
        <View style={[styles.searchBar, Platform.OS === 'ios' ? styles.searchBarIOS : styles.searchBarAndroid]}>
          <Ionicons name="search" size={18} color="#888" />
          <TextInput
            placeholder="Search Shipping"
            placeholderTextColor="#888"
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={styles.searchInput}
          />
        </View>
      </View>

      {/* ================= CONTENT ================= */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadOrders(true)}
          />
        }
      >
        {loading ? (
          <LoadingScreen message="Loading orders..." />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <View style={styles.orders}>
            <Text style={styles.sectionTitle}>Available Orders</Text>

            {filteredOrders.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyIcon}>📦</Text>
                <Text style={styles.emptyTitle}>No orders available</Text>
                <Text style={styles.emptySub}>Check back later</Text>
              </View>
            ) : (
              filteredOrders.map((order) => {
                const isPicking = pickingOrderId === order.id;
                const financialStatus = order.displayFinancialStatus || 'PENDING';
                const isCOD = financialStatus !== 'PAID' && financialStatus !== 'AUTHORIZED';
                const orderType = isCOD ? 'COD' : 'Prepaid';
                
                return (
                  <TouchableOpacity
                    key={order.id}
                    style={styles.card}
                    activeOpacity={0.85}
                    onPress={() => onOrderSelect?.(order.id)}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.orderNumber}>{order.name}</Text>
                      <View style={[styles.orderTypeBadge, isCOD ? styles.codBadge : styles.prepaidBadge]}>
                        <Text style={[styles.orderTypeText, { color: isCOD ? '#E65100' : '#2E7D32' }]}>{orderType}</Text>
                      </View>
                    </View>

                    <Text numberOfLines={2} style={styles.address}>
                      {order.shippingAddress?.address1},{' '}
                      {order.shippingAddress?.city}
                    </Text>

                    <TouchableOpacity
                      style={[styles.pickBtn, isPicking && { opacity: 0.6 }]}
                      disabled={isPicking}
                      onPress={(e) => {
                        e.stopPropagation();
                        handlePickOrder(order);
                      }}
                    >
                      {isPicking ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.pickText}>Pick This Order</Text>
                      )}
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ================= TOP FADE (MASK) ================= */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'rgba(0,0,0,0.9)',
          'rgba(0,0,0,0.6)',
          'rgba(0,0,0,0.3)',
          'rgba(0,0,0,0)',
        ]}
        locations={[0, 0.35, 0.65, 1]}
        style={styles.topFade}
      />
    </SafeAreaView>
  );
};

export default HomeScreen;

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },

  /* Fade overlay (BELOW header/search) */
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 230,
    zIndex: 20,
  },

  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 30,
    elevation: 30,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },

  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },

  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 18,
  },

  greeting: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },

  locationRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },

  location: {
    color: '#fff',
    opacity: 0.9,
  },

  notify: {
    width: 50,
    height: 50,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  searchWrapper: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    zIndex: 30,
    elevation: 30,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
  },
  searchBarIOS: {
    paddingVertical: 14,
    minHeight: 50,
  },
  searchBarAndroid: {
    paddingVertical: 5,
    minHeight: 46,
  },

  searchInput: {
    flex: 1,
    fontSize: 15,
  },

  orders: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  orderNumber: {
    fontWeight: '700',
    fontSize: 16,
    flex: 1,
  },
  orderTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  codBadge: {
    backgroundColor: '#FFF3E0',
  },
  prepaidBadge: {
    backgroundColor: '#E8F5E9',
  },
  orderTypeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  address: {
    color: '#666',
    marginBottom: 12,
  },

  pickBtn: {
    backgroundColor: theme.colors.success,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },

  pickText: {
    color: '#fff',
    fontWeight: '700',
  },

  empty: {
    alignItems: 'center',
    paddingVertical: 80,
  },

  emptyIcon: {
    fontSize: 56,
  },

  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
  },

  emptySub: {
    color: '#777',
    marginTop: 6,
  },

  error: {
    textAlign: 'center',
    color: 'red',
    marginTop: 40,
  },
});
