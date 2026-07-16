import { useQuery } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { driverApi } from "@/lib/api/driver";
import { apiError } from "@/lib/api/client";
import { Button } from "@/components/ui/Button";
import { formatDate, formatSom } from "@/lib/format";
import { t } from "@/lib/strings";
import type { WalletTx } from "@/lib/types";
import { colors, radius, spacing } from "@/theme/colors";

export default function DriverWalletScreen() {
  const router = useRouter();
  const wallet = useQuery({ queryKey: ["driver-wallet"], queryFn: () => driverApi.wallet() });
  const txs = useQuery({ queryKey: ["driver-txs"], queryFn: () => driverApi.transactions() });

  return (
    <SafeAreaView style={styles.safe}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>←</Text>
        </Pressable>
        <Text style={styles.title}>{t.driver.wallet.title}</Text>
      </View>

      {wallet.isLoading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : wallet.isError ? (
        <View style={styles.center}>
          <Text style={styles.err}>{apiError(wallet.error)}</Text>
          <Button title={t.common.retry} variant="ghost" onPress={() => wallet.refetch()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing(5), gap: spacing(4) }}>
          {/* Balance */}
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>{t.driver.wallet.balance}</Text>
            <Text
              style={[
                styles.balanceValue,
                (wallet.data?.balance ?? 0) < 0 && { color: colors.danger },
              ]}
            >
              {formatSom(wallet.data?.balance)}
            </Text>
            {(wallet.data?.commission_owed ?? 0) > 0 ? (
              <View style={styles.owedRow}>
                <Text style={styles.owedLabel}>{t.driver.wallet.owed}</Text>
                <Text style={styles.owedValue}>{formatSom(wallet.data?.commission_owed)}</Text>
              </View>
            ) : null}
          </View>

          {wallet.data?.blocked ? (
            <View style={styles.blockedCard}>
              <Text style={styles.blockedTitle}>⚠ {t.driver.wallet.blockedTitle}</Text>
              <Text style={styles.blockedBody}>
                {t.driver.wallet.blockedBody(formatSom(wallet.data.min_balance))}
              </Text>
            </View>
          ) : null}

          {/* Transactions */}
          <Text style={styles.section}>{t.driver.wallet.transactions}</Text>
          {txs.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : !txs.data || txs.data.length === 0 ? (
            <Text style={styles.empty}>{t.driver.wallet.empty}</Text>
          ) : (
            <View style={styles.txList}>
              {txs.data.map((tx, i) => (
                <TxRow key={i} tx={tx} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function TxRow({ tx }: { tx: WalletTx }) {
  const positive = tx.amount >= 0;
  return (
    <View style={styles.txRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.txType}>
          {t.driver.wallet.txTypes[tx.tx_type] ?? tx.tx_type}
        </Text>
        <Text style={styles.txDate}>{formatDate(tx.created_at)}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.txAmount, { color: positive ? colors.success : colors.danger }]}>
          {positive ? "+" : "−"} {formatSom(Math.abs(tx.amount))}
        </Text>
        <Text style={styles.txBalance}>{formatSom(tx.balance_after)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: spacing(4), padding: spacing(5) },
  back: { fontSize: 24, color: colors.text },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing(3) },
  err: { color: colors.danger, fontSize: 14 },
  balanceCard: {
    borderRadius: radius.lg,
    padding: spacing(5),
    backgroundColor: colors.text,
  },
  balanceLabel: { fontSize: 13, color: "#cbd5e1" },
  balanceValue: { fontSize: 30, fontWeight: "800", color: "#fff", marginTop: spacing(1) },
  owedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing(4),
    paddingTop: spacing(3),
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  owedLabel: { color: "#cbd5e1", fontSize: 14 },
  owedValue: { color: "#fca5a5", fontSize: 14, fontWeight: "700" },
  blockedCard: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing(4),
    gap: spacing(1),
  },
  blockedTitle: { color: colors.danger, fontSize: 15, fontWeight: "700" },
  blockedBody: { color: colors.danger, fontSize: 13 },
  section: { fontSize: 15, fontWeight: "600", color: colors.text },
  empty: { color: colors.muted, fontSize: 14, textAlign: "center", paddingVertical: spacing(6) },
  txList: { gap: spacing(2) },
  txRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3),
    backgroundColor: colors.surface,
  },
  txType: { fontSize: 14, fontWeight: "600", color: colors.text },
  txDate: { fontSize: 12, color: colors.muted, marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700" },
  txBalance: { fontSize: 11, color: colors.muted, marginTop: 2 },
});
