// Types mirroring the backend (app/schemas). Extended per stage.

export type Role = "passenger" | "driver" | "admin";

/** Which app the user is currently using. One account can do both. */
export type AppMode = "passenger" | "driver";

export interface UserPublic {
  id: string;
  phone: string;
  full_name: string;
  /** Primary role. Does NOT gate the passenger app — everyone can ride. */
  role: Role;
  avatar_url: string | null;
  is_active: boolean;
  is_blocked: boolean;
  /** True once the account has a driver profile (any status). */
  is_driver: boolean;
  driver_status: string | null;
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

export type PaymentMethod = "cash" | "payme" | "click" | "uzum" | "wallet";

export type DriverStatus = "pending" | "approved" | "rejected" | "suspended";
export type DocType =
  | "passport"
  | "tech_passport"
  | "car_photo_front"
  | "car_photo_back";
export type DocStatus = "pending" | "approved" | "rejected";

export interface DriverProfile {
  id: string;
  user_id: string;
  car_model: string;
  car_number: string;
  car_color: string | null;
  car_year: number | null;
  rating: string;
  total_rides: number;
  status: DriverStatus;
  is_online: boolean;
}

export interface DriverDocument {
  id: string;
  driver_id: string;
  doc_type: DocType;
  file_url: string;
  status: DocStatus;
  reject_reason: string | null;
  reviewed_at: string | null;
  uploaded_at: string | null;
}

export interface DriverTodayStats {
  rides_completed: number;
  earnings_sum: number;
  is_online: boolean;
}

export interface RideOfferDetails {
  ride_id: string;
  from_address: string;
  to_address: string;
  distance_km: string | null;
  price_sum: number | null;
  payment_method: PaymentMethod;
  passenger_rating: number | null;
}

export interface DailyEarning {
  day: string;
  earning: number;
}

export interface DriverEarnings {
  today_sum: number;
  week_sum: number;
  month_sum: number;
  daily: DailyEarning[];
}

export interface DriverWallet {
  balance: number;
  total_earned: number;
  total_withdrawn: number;
  commission_owed: number;
  min_balance: number;
  blocked: boolean;
}

export interface WalletTx {
  amount: number;
  tx_type: string;
  description: string | null;
  balance_after: number;
  created_at: string | null;
}

export interface DriverRideHistory {
  ride_id: string;
  from_address: string;
  to_address: string;
  distance_km: string | null;
  price_sum: number | null;
  driver_earning: number | null;
  status: RideStatus;
  completed_at: string | null;
  created_at: string | null;
}

export interface RideEarningBreakdown {
  ride_amount: number;
  commission_pct: string;
  commission_sum: number;
  driver_earning: number;
}

export interface DriverBonus {
  campaign_id: number;
  name: string;
  description: string | null;
  bonus_type: string;
  target_value: number | null;
  bonus_amount: number | null;
  progress: number;
  is_completed: boolean;
}

export interface RideDriverView {
  id: string;
  status: RideStatus;
  from_address: string;
  to_address: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  distance_km: string | null;
  price_sum: number | null;
  payment_method: PaymentMethod;
  passenger_name: string;
  passenger_phone: string;
  passenger_rating: number | null;
}

export type RideStatus =
  | "searching"
  | "accepted"
  | "arrived"
  | "ongoing"
  | "completed"
  | "cancelled";

export interface EstimateResponse {
  distance_km: number;
  duration_min: number;
  base_fare: number;
  price_per_km: number;
  night: boolean;
  night_multiplier: number;
  price_sum: number;
  discount: number;
  final_price: number;
  currency: string;
}

export interface RideDriverInfo {
  driver_id: string;
  full_name: string;
  phone: string;
  car_model: string;
  car_number: string;
  car_color: string | null;
  rating: string;
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
