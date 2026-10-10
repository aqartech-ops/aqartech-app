import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function FinancialsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>المالية والفواتير</Text>
      
      <View style={styles.card}>
        <MaterialCommunityIcons name="cash-multiple" size={50} color={COLORS.primary} style={{marginBottom: 15}} />
        <Text style={styles.cardTitle}>لا توجد فواتير مسجلة</Text>
        <Text style={styles.cardDetails}>قم بإصدار فاتورة جديدة لمتابعة الإيرادات.</Text>
        
        <TouchableOpacity style={styles.button} onPress={() => alert('إصدار فاتورة جديدة')}>
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" style={{marginRight: 8}} />
          <Text style={styles.buttonText}>إصدار فاتورة</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SIZES.padding, backgroundColor: COLORS.background },
  title: { fontSize: SIZES.large, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 20, textAlign: 'right' },
  card: { backgroundColor: COLORS.card, padding: 30, borderRadius: SIZES.radius, alignItems: 'center', ...SHADOWS.floating },
  cardTitle: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 10 },
  cardDetails: { fontSize: SIZES.font, color: COLORS.textMuted, marginBottom: 20, textAlign: 'center' },
  button: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, paddingVertical: 12, paddingHorizontal: 25, borderRadius: SIZES.radius, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: SIZES.font }
});