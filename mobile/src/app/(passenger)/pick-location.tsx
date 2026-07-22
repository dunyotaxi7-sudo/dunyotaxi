import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BUKHARA_CENTER,
  Map,
  type Coords,
  type MapHandle,
  type PlaceSuggestion,
  isWithinServiceArea,
  placeCoords,
  reverseGeocode,
  suggestPlaces,
  useCurrentLocation,
} from "@/components/Map";
import { Button } from "@/components/ui/Button";
import { t } from "@/lib/strings";
import { useRideDraft } from "@/store/ride";
import { colors, radius, spacing } from "@/theme/colors";

export default function PickLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { target } = useLocalSearchParams<{ target: "from" | "to" }>();
  const isFrom = target === "from";

  const { from, to, setFrom, setTo } = useRideDraft();
  const location = useCurrentLocation();
  const mapRef = useRef<MapHandle>(null);

  // The candidate = whatever the map is currently centered on.
  const existing = isFrom ? from : to;
  const initial = existing?.coords ?? location.coords ?? BUKHARA_CENTER;
  const [candidate, setCandidate] = useState<Coords>(initial);
  const [address, setAddress] = useState<string>(existing?.address ?? "");
  const [resolving, setResolving] = useState(false);

  // Search / autocomplete.
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);

  const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextSearch = useRef(false);

  // Reverse-geocode the centered point, debounced.
  function onRegionChange(center: Coords) {
    setCandidate(center);
    setResolving(true);
    if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    geocodeTimer.current = setTimeout(async () => {
      const label = await reverseGeocode(center);
      setAddress(label);
      setResolving(false);
    }, 450);
  }

  // Resolve the initial address on mount.
  useEffect(() => {
    if (!existing) {
      void reverseGeocode(initial).then(setAddress);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // As-you-type suggestions (Bukhara-biased), debounced.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const q = query.trim();
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      const results = await suggestPlaces(q);
      setSuggestions(results);
      setSearching(false);
    }, 300);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  async function selectSuggestion(s: PlaceSuggestion) {
    skipNextSearch.current = true;
    setQuery(s.primary);
    setSuggestions([]);
    setFocused(false);
    Keyboard.dismiss();
    const coords = await placeCoords(s.id);
    if (coords) {
      setCandidate(coords);
      setAddress([s.primary, s.secondary].filter(Boolean).join(", "));
      mapRef.current?.animateTo(coords, 16);
      // onRegionChange fires from the animation and refines the label.
    }
  }

  function useMyLocation() {
    const coords = location.coords;
    if (!coords) return;
    skipNextSearch.current = true;
    setQuery("");
    setSuggestions([]);
    setFocused(false);
    Keyboard.dismiss();
    setCandidate(coords);
    mapRef.current?.animateTo(coords, 16);
    void reverseGeocode(coords).then(setAddress);
  }

  function confirm() {
    const place = { coords: candidate, address: address || t.pick.selected };
    if (isFrom) setFrom(place);
    else setTo(place);
    router.back();
  }

  const outside = !isWithinServiceArea(candidate);
  const q = query.trim();
  const showMyLoc = focused && q === "" && Boolean(location.coords);
  const showList = showMyLoc || q.length >= 2;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false, presentation: "modal" }} />

      <Map
        ref={mapRef}
        initialCamera={{ center: initial, zoom: 16 }}
        showUserLocation
        showServiceArea
        onRegionChange={onRegionChange}
      />

      {/* Fixed center pin (screen center == map center). */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <View style={[styles.pin, { backgroundColor: isFrom ? colors.primary : colors.danger }]} />
        <View style={[styles.pinStick, { backgroundColor: isFrom ? colors.primary : colors.danger }]} />
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, { top: insets.top + spacing(3) }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t.pick.search}
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
        />
        {searching && <ActivityIndicator style={{ marginRight: spacing(2) }} />}
      </View>

      {/* Suggestions panel */}
      {showList && (
        <View style={[styles.panel, { top: insets.top + spacing(3) + 52 }]}>
          <ScrollView keyboardShouldPersistTaps="handled">
            {showMyLoc && (
              <Pressable style={styles.row} onPress={useMyLocation}>
                <Text style={styles.rowIcon}>📍</Text>
                <Text style={[styles.rowPrimary, { color: colors.primary }]}>
                  {t.pick.useMyLocation}
                </Text>
              </Pressable>
            )}
            {suggestions.map((s) => (
              <Pressable
                key={s.id}
                style={styles.row}
                onPress={() => selectSuggestion(s)}
              >
                <Text style={styles.rowIcon}>📌</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowPrimary} numberOfLines={1}>
                    {s.primary}
                  </Text>
                  {!!s.secondary && (
                    <Text style={styles.rowSecondary} numberOfLines={1}>
                      {s.secondary}
                    </Text>
                  )}
                </View>
              </Pressable>
            ))}
            {q.length >= 2 && !searching && suggestions.length === 0 && (
              <Text style={styles.empty}>{t.pick.noResults}</Text>
            )}
          </ScrollView>
        </View>
      )}

      {/* Confirm card */}
      <View style={[styles.card, { paddingBottom: insets.bottom + spacing(4) }]}>
        <Text style={styles.cardLabel}>
          {isFrom ? t.pick.fromTitle : t.pick.toTitle}
        </Text>
        <View style={styles.addressRow}>
          <Text style={styles.address} numberOfLines={2}>
            {resolving ? t.pick.resolving : address || "—"}
          </Text>
        </View>
        {outside ? <Text style={styles.outside}>⚠ {t.pick.outside}</Text> : null}
        <Button
          title={t.pick.confirm}
          onPress={confirm}
          disabled={outside}
          style={{ marginTop: spacing(3) }}
        />
      </View>
    </View>
  );
}

const PIN_SIZE = 18;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  pinWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pin: {
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    borderWidth: 3,
    borderColor: "#fff",
    // Nudge up so the stick tip sits on the exact center.
    marginBottom: 22,
  },
  pinStick: {
    position: "absolute",
    top: "50%",
    width: 3,
    height: 22,
    marginTop: -2,
  },
  searchWrap: {
    position: "absolute",
    left: spacing(4),
    right: spacing(4),
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    paddingLeft: spacing(2),
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  backBtn: { padding: spacing(2) },
  search: { flex: 1, height: 46, fontSize: 15, color: colors.text },
  panel: {
    position: "absolute",
    left: spacing(4),
    right: spacing(4),
    maxHeight: 280,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowIcon: { fontSize: 16, marginRight: spacing(3) },
  rowPrimary: { fontSize: 15, color: colors.text, fontWeight: "500" },
  rowSecondary: { fontSize: 12, color: colors.muted, marginTop: 1 },
  empty: {
    padding: spacing(4),
    fontSize: 14,
    color: colors.muted,
    textAlign: "center",
  },
  card: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing(5),
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  cardLabel: { fontSize: 12, color: colors.muted, marginBottom: spacing(1) },
  addressRow: { minHeight: 44, justifyContent: "center" },
  address: { fontSize: 16, color: colors.text, fontWeight: "500" },
  outside: { color: colors.danger, fontSize: 13, marginTop: spacing(2) },
});
