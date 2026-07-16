// Types mirroring the FastAPI backend schemas (app/schemas/*).
// Money fields are integers in so'm.

export type Role = "passenger" | "driver" | "admin";

export type DriverStatus = "pending" | "approved" | "rejected" | "suspended";

export type RideStatus =
  | "searching"
  | "accepted"
  | "arrived"
  | "ongoing"
  | "completed"
  | "cancelled";

export type PaymentMethod = "cash" | "payme" | "click" | "uzum" | "wallet";

export type DocType = "passport" | "license" | "tech_passport" | "inspection";

export type DocStatus = "pending" | "approved" | "rejected";

export interface UserPublic {
  id: string;
  phone: string;
  full_name: string;
  role: Role;
  avatar_url: string | null;
  is_active: boolean;
  is_blocked: boolean;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserPublic;
}

export interface RequestOTPResponse {
  detail: string;
  expires_in: number;
  debug_code: string | null;
}

export interface DriverPublic {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  car_model: string;
  car_number: string;
  car_color: string | null;
  car_year?: number | null;
  rating: string; // Decimal serialized as string
  total_rides: number;
  status: DriverStatus;
  is_online: boolean;
  balance: number; // so'm
  low_balance: boolean;
}

export interface DriverBalanceResult {
  driver_id: string;
  amount: number;
  balance: number;
  low_balance: boolean;
}

export interface DriverTxRow {
  id: string;
  created_at: string | null;
  tx_type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  ride_id: string | null;
  from_address: string | null;
  to_address: string | null;
  ride_amount: number | null;
  commission_pct: string | null;
}

export interface CreateDriverInput {
  phone: string;
  full_name: string;
  car_model: string;
  car_number: string;
  car_color?: string;
  car_year?: number;
  status: DriverStatus;
}

export interface UpdateDriverProfileInput {
  full_name?: string;
  car_model?: string;
  car_number?: string;
  car_color?: string;
  car_year?: number;
}

export interface DocumentPublic {
  id: string;
  driver_id: string;
  doc_type: DocType;
  file_url: string;
  status: DocStatus;
  reject_reason: string | null;
  reviewed_at: string | null;
  uploaded_at: string | null;
}

export interface OnlineDriver {
  driver_id: string;
  lat: number;
  lng: number;
  distance_m: number | null;
  rating: number | null;
  car_model: string | null;
  car_number: string | null;
}

export interface RidePublic {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  from_address: string;
  to_address: string;
  distance_km: string | null;
  duration_min: number | null;
  price_sum: number | null;
  status: RideStatus;
  payment_method: PaymentMethod;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}

export interface PricingConfig {
  id: number;
  base_fare: number;
  base_km: string;
  price_per_km: number;
  min_price: number;
  night_multiplier: string;
  night_start: string; // "22:00:00"
  night_end: string;
  is_active: boolean;
  updated_at: string | null;
}

export interface PricingConfigUpdate {
  base_fare?: number;
  base_km?: number;
  price_per_km?: number;
  min_price?: number;
  night_multiplier?: number;
  night_start?: string;
  night_end?: string;
  is_active?: boolean;
}

export interface CommissionConfig {
  id: number;
  driver_id: string | null;
  commission_pct: string;
  valid_from: string;
  valid_until: string | null;
  created_at: string | null;
}

export interface BonusCampaign {
  id: number;
  name: string;
  description: string | null;
  bonus_type: string;
  target_value: number | null;
  bonus_amount: number | null;
  bonus_pct: string | null;
  applies_to: string;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
  created_at: string | null;
}

export interface PromoCode {
  id: number;
  code: string;
  discount_type: "fixed" | "percent";
  discount_value: number;
  max_discount: number | null;
  min_ride_price: number;
  usage_limit: number | null;
  used_count: number;
  per_user_limit: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

export interface Stats {
  rides_total: number;
  rides_completed: number;
  rides_cancelled: number;
  rides_active: number;
  revenue_sum: number;
  commission_sum: number;
  active_drivers: number;
  online_drivers: number;
  period_from: string | null;
  period_to: string | null;
}

export interface DailyStat {
  day: string;
  rides: number;
  completed: number;
  revenue_sum: number;
}

export interface AdminRideRow {
  id: string;
  passenger_name: string | null;
  driver_name: string | null;
  from_address: string;
  to_address: string;
  distance_km: string | null;
  price_sum: number | null;
  status: RideStatus;
  payment_method: string;
  created_at: string | null;
}

export interface LiveRideRow {
  id: string;
  passenger_name: string | null;
  passenger_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  from_address: string;
  to_address: string;
  price_sum: number | null;
  status: RideStatus;
  created_at: string | null;
  accepted_at: string | null;
}

export interface AdminRideRating {
  score: number;
  comment: string | null;
  from_role: string;
}

export interface AdminRideDetail {
  id: string;
  status: RideStatus;
  from_address: string;
  to_address: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  distance_km: string | null;
  duration_min: number | null;
  price_sum: number | null;
  payment_method: string;
  payment_status: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string | null;
  completed_at: string | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  car_model: string | null;
  car_number: string | null;
  commission_sum: number | null;
  driver_earning: number | null;
  commission_pct: string | null;
  ratings: AdminRideRating[];
}

export interface PassengerRow {
  id: string;
  full_name: string;
  phone: string;
  total_rides: number;
  is_blocked: boolean;
  created_at: string | null;
}

export interface PassengerDetail {
  id: string;
  full_name: string;
  phone: string;
  is_blocked: boolean;
  created_at: string | null;
  total_rides: number;
  completed_rides: number;
  ratings_given: number;
}

export interface UpdatePassengerInput {
  full_name?: string;
  phone?: string;
}

export interface CreatePassengerInput {
  phone: string;
  full_name: string;
}

export interface UserLookup {
  found: boolean;
  full_name: string | null;
  role: string | null;
  is_blocked: boolean;
}

export interface ServiceArea {
  name: string;
  point_count: number;
  geojson: unknown;
}

export type ConnectMode = "auto" | "offer" | "assign";

export interface OrderLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface CreateOrderInput {
  passenger_id: string;
  pickup: OrderLocation;
  destination: OrderLocation;
  distance_km?: number;
  connect_mode: ConnectMode;
  driver_id?: string | null;
}

export interface AdminOrderResult {
  ride_id: string;
  status: RideStatus;
  connect_mode: ConnectMode;
  passenger_id: string;
  passenger_phone: string;
  passenger_name: string;
  driver_id: string | null;
  price_sum: number | null;
  distance_km: string | null;
}

export interface AuditLog {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
}
