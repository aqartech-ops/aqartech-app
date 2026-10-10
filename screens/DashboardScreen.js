// screens/DashboardScreen.js
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function DashboardScreen() {
  const handleAddAction = (actionName) => {
    Alert.alert('إجراء جديد', `سيتم فتح نافذة: ${actionName}`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16, paddingTop: 15 }}>
      
      {/* رأس الصفحة: العنوان والترحيب */}
      <View style={styles.headerContainer}>
        <Text style={styles.title}>لوحة القيادة</Text>
        <Text style={styles.welcomeSubtitle}>مرحباً بعودتك، المهندس رضوان الهنائي </Text>
      </View>

      {/* أزرار الإجراءات السريعة (مخصصة للموبايل) */}
      <View style={styles.actionButtonsRow}>
        <TouchableOpacity 
          style={styles.primaryActionButton} 
          onPress={() => handleAddAction('إضافة مستأجر جديد')}
        >
          <MaterialCommunityIcons name="account-plus-outline" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
          <Text style={styles.primaryActionText}>مستأجر جديد</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryActionButton} 
          onPress={() => handleAddAction('إضافة عقار')}
        >
          <MaterialCommunityIcons name="home-plus-outline" size={18} color={COLORS.primary} style={{ marginLeft: 6 }} />
          <Text style={styles.secondaryActionText}>إضافة عقار</Text>
        </TouchableOpacity>
      </View>

      {/* بطاقات الإحصائيات (شبكة من عمودين لتناسب الهواتف) */}
      <View style={styles.gridRow}>
        
        {/* بطاقة: إجمالي العقارات */}
        <View style={styles.statCardHalf}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>إجمالي العقارات</Text>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="home-outline" size={20} color="#D97706" />
            </View>
          </View>
          <Text style={styles.cardValue}>8</Text>
        </View>

        {/* بطاقة: إجمالي الوحدات */}
        <View style={styles.statCardHalf}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>إجمالي الوحدات</Text>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="domain" size={20} color="#0284C7" />
            </View>
          </View>
          <Text style={styles.cardValue}>285</Text>
        </View>

      </View>

      <View style={styles.gridRow}>
        
        {/* بطاقة: المستأجرين النشطين */}
        <View style={styles.statCardHalf}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>المستأجرين النشطين</Text>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="account-group-outline" size={20} color="#D97706" />
            </View>
          </View>
          <Text style={styles.cardValue}>237</Text>
        </View>

        {/* بطاقة: الوحدات الشاغرة */}
        <View style={styles.statCardHalf}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>الوحدات الشاغرة</Text>
            <View style={styles.iconBox}>
              <MaterialCommunityIcons name="chart-bar" size={20} color="#16A34A" />
            </View>
          </View>
          <Text style={styles.cardValue}>47</Text>
        </View>

      </View>

      {/* البطاقات المالية (عرض كامل لتوضيح الأرقام براحة) */}
      <View style={styles.statCardFull}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>إجمالي الإيجارات المحصلة (هذا الشهر)</Text>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="cash-check" size={20} color="#16A34A" />
          </View>
        </View>
        <Text style={styles.cardFinancialValue}>OMR 0.00</Text>
        <TouchableOpacity style={styles.detailsLink} onPress={() => Alert.alert('التفاصيل', 'عرض تفاصيل الإيرادات المحصلة')}>
          <Text style={styles.detailsLinkText}>عرض التفاصيل</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statCardFull}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>إجمالي الإيجارات المستحقة (هذا الشهر)</Text>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="wallet-outline" size={20} color="#D97706" />
          </View>
        </View>
        <Text style={styles.cardFinancialValue}>OMR 0.00</Text>
        <TouchableOpacity style={styles.detailsLink} onPress={() => Alert.alert('التفاصيل', 'عرض تفاصيل المستحقات')}>
          <Text style={styles.detailsLinkText}>عرض التفاصيل</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statCardFull}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>إجمالي المصروفات (هذا الشهر)</Text>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="file-document-edit-outline" size={20} color="#DC2626" />
          </View>
        </View>
        <Text style={styles.cardFinancialValue}>OMR 0.00</Text>
      </View>

      {/* بطاقة عقود تنتهي قريباً مع التفاصيل */}
      <View style={styles.statCardFull}>
        <View style={styles.cardHeaderRow}>
          <Text style={styles.cardLabel}>عقود تنتهي قريباً</Text>
          <View style={styles.iconBox}>
            <MaterialCommunityIcons name="file-alert-outline" size={20} color="#0284C7" />
          </View>
        </View>
        <Text style={styles.cardValue}>205</Text>
        
        <View style={styles.contractSubDetails}>
          <Text style={styles.contractSubText}>• (5) خلال أسبوعين</Text>
          <Text style={styles.contractSubText}>• (11) خلال شهر</Text>
          <Text style={styles.contractSubText}>• (16) خلال 3 أشهر</Text>
          <Text style={[styles.contractSubText, { color: '#DC2626' }]}>• (173) انتهى دون إجراء</Text>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.background 
  },
  headerContainer: {
    alignItems: 'flex-end',
    marginBottom: 15,
  },
  title: { 
    fontSize: 22, 
    fontWeight: 'bold', 
    color: COLORS.textDark, 
    marginBottom: 2, 
    textAlign: 'right' 
  },
  welcomeSubtitle: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  actionButtonsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  primaryActionButton: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    ...SHADOWS.floating,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  secondaryActionButton: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    ...SHADOWS.floating,
  },
  secondaryActionText: {
    color: COLORS.primary,
    fontWeight: 'bold',
    fontSize: 12,
  },
  gridRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCardHalf: {
    width: '48%',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(182, 141, 106, 0.2)',
    ...SHADOWS.floating,
  },
  statCardFull: {
    width: '100%',
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(182, 141, 106, 0.2)',
    ...SHADOWS.floating,
  },
  cardHeaderRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.textMuted,
    textAlign: 'right',
    flex: 1,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(182, 141, 106, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.textDark,
    textAlign: 'right',
  },
  cardFinancialValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.textDark,
    textAlign: 'right',
    marginBottom: 4,
  },
  detailsLink: {
    marginTop: 4,
    alignItems: 'flex-end',
  },
  detailsLinkText: {
    fontSize: 11,
    color: COLORS.primary,
    fontWeight: 'bold',
  },
  contractSubDetails: {
    marginTop: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(182, 141, 106, 0.15)',
    paddingTop: 8,
  },
  contractSubText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'right',
    marginBottom: 4,
  },
});