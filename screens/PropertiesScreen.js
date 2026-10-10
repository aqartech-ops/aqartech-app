import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons'; 

export default function PropertiesScreen() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState('OWNED'); 
  const [submitting, setSubmitting] = useState(false);

  const API_URL = 'http://192.168.1.123:3000/property';
  const COMPANIES_API_URL = 'http://192.168.1.123:3000/company';

  const fetchProperties = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      const data = await response.json();
      setProperties(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('خطأ في جلب العقارات:', error);
      Alert.alert('تنبيه', 'تعذر الاتصال بالخادم لجلب العقارات');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProperty = async () => {
    if (!name.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم العقار');
      return;
    }

    try {
      setSubmitting(true);
      const compRes = await fetch(COMPANIES_API_URL);
      const companiesData = await compRes.json();

      if (!Array.isArray(companiesData) || companiesData.length === 0) {
        Alert.alert('تنبيه', 'يجب إضافة شركة واحدة على الأقل في قسم الشركات قبل إضافة العقارات.');
        setSubmitting(false);
        return;
      }

      const activeCompanyId = companiesData[0].id;

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address: address || null,
          type,
          companyId: activeCompanyId,
        }),
      }); 
      
      const result = await response.json();

      if (response.ok) {
        Alert.alert('نجاح', 'تمت إضافة العقار بنجاح!');
        setName('');
        setAddress('');
        fetchProperties(); 
      } else {
        console.error('خطأ من الخادم:', result);
        Alert.alert('خطأ', result.message || 'فشل حفظ العقار');
      }
    } catch (error) {
      console.error('خطأ في الإضافة:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إدارة العقارات والوحدات</Text>

      <View style={styles.formContainer}>
        
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="office-building-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
          <TextInput
            style={styles.input}
            placeholder="اسم العقار (مثال: برج الروابي)..."
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
            textAlign="right"
          />
        </View>

        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="map-marker-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
          <TextInput
            style={styles.input}
            placeholder="العنوان التفصيلي..."
            placeholderTextColor={COLORS.textMuted}
            value={address}
            onChangeText={setAddress}
            textAlign="right"
          />
        </View>
        
        {/* أزرار اختيار نوع العقار */}
        <View style={styles.typeRow}>
          <TouchableOpacity 
            style={[styles.typeButton, type === 'OWNED' && styles.typeButtonActive]}
            onPress={() => setType('OWNED')}>
            <Text style={[styles.typeText, type === 'OWNED' && styles.typeTextActive]}>مملوك (OWNED)</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.typeButton, type === 'MANAGED' && styles.typeButtonActive]}
            onPress={() => setType('MANAGED')}>
            <Text style={[styles.typeText, type === 'MANAGED' && styles.typeTextActive]}>مُدار (MANAGED)</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleCreateProperty}
          disabled={submitting}>
          <MaterialCommunityIcons name="home-plus-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.saveButtonText}>{submitting ? 'جاري الحفظ...' : 'حفظ العقار'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={fetchProperties}>
          <Text style={styles.refreshText}>تحديث القائمة</Text>
        </TouchableOpacity>
        <Text style={styles.subTitleHeader}>قائمة العقارات المسجلة</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>جاري التحميل...</Text>
        </View>
      ) : properties.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>لا توجد عقارات مسجلة حالياً.</Text>
        </View>
      ) : (
        <FlatList
          data={properties}
          keyExtractor={(item) => item.id ? item.id.toString() : Math.random().toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              
              <View style={styles.cardLeftIcon}>
                 <MaterialCommunityIcons name="home-city-outline" size={30} color={COLORS.primary} />
              </View>

              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                
                <Text style={styles.cardDetails}>
                  <MaterialCommunityIcons name="circle" size={8} color={item.type === 'OWNED' ? COLORS.primary : COLORS.textMuted} />
                  {' '}النوع: {item.type === 'OWNED' ? 'مملوك' : 'مُدار'}
                </Text>
                
                <Text style={styles.cardDetails}>
                  <MaterialCommunityIcons name="map-marker" size={10} color={COLORS.textMuted} />
                  {' '}العنوان: {item.address || 'غير متوفر'}
                </Text>
              </View>

              <View style={styles.cardRightBadge}>
                <Text style={styles.cardUnitsText}>{item.units ? item.units.length : 0}</Text>
                <Text style={{fontSize: 9, color: COLORS.textMuted}}>وحدة</Text>
              </View>

            </View>
          )}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SIZES.padding, backgroundColor: COLORS.background },
  title: { fontSize: SIZES.large, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 15, textAlign: 'right' },
  
  formContainer: {
    backgroundColor: COLORS.card,
    padding: 18,
    borderRadius: SIZES.radius,
    marginBottom: SIZES.padding,
    ...SHADOWS.floating,
  },
  
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: SIZES.radius,
    marginBottom: 12,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconLeft: { marginRight: 10 },
  input: {
    flex: 1,
    color: COLORS.textDark,
    paddingVertical: 12,
    fontSize: SIZES.font,
  },
  
  typeRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 12 },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: SIZES.radius,
    marginHorizontal: 4,
  },
  typeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  typeText: { color: COLORS.textMuted, fontSize: SIZES.small, fontWeight: 'bold' },
  typeTextActive: { color: '#FFFFFF' },
  
  saveButton: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: SIZES.medium },
  
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  subTitleHeader: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark },
  refreshText: { color: COLORS.textMuted, fontSize: SIZES.small, fontWeight: 'normal' },
  
  centerContainer: { padding: SIZES.padding, alignItems: 'center' },
  loadingText: { color: COLORS.textMuted, marginTop: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: SIZES.font, textAlign: 'center' },
  listContainer: { paddingBottom: SIZES.padding },
  
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: SIZES.radius,
    marginBottom: 12,
    ...SHADOWS.floating,
  },
  cardLeftIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: { flex: 1, paddingHorizontal: 15 },
  cardTitle: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 6, textAlign: 'right' },
  cardDetails: { fontSize: SIZES.small, color: COLORS.textMuted, marginBottom: 3, textAlign: 'right' },
  
  cardRightBadge: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
  },
  cardUnitsText: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary },
});