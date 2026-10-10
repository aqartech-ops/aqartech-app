import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme'; 
import { MaterialCommunityIcons } from '@expo/vector-icons'; // مكتبة الأيقونات لإضافة اللمسة الجمالية

export default function CompaniesScreen() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const API_URL = 'http://192.168.1.123:3000/company';

  const fetchCompanies = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      const data = await response.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('خطأ في جلب الشركات:', error);
      Alert.alert('تنبيه', 'تعذر الاتصال بالخادم لجلب الشركات');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!name.trim()) {
      Alert.alert('تنبيه', 'الرجاء إدخال اسم الشركة على الأقل');
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: email || null,
          phone: phone || null,
        }),
      });

      if (response.ok) {
        Alert.alert('نجاح', 'تمت إضافة الشركة بنجاح!');
        setName('');
        setEmail('');
        setPhone('');
        fetchCompanies();
      } else {
        Alert.alert('خطأ', 'فشل حفظ الشركة في قاعدة البيانات');
      }
    } catch (error) {
      console.error('خطأ في الإضافة:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إدارة الشركات والاشتراكات</Text>
      
      {/* صندوق الإضافة الأبيض ذو الظل الناعم */}
      <View style={styles.formContainer}>
        
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="office-building" size={22} color={COLORS.primary} style={styles.iconLeft} />
          <TextInput
            style={styles.input}
            placeholder="اسم الشركة..."
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
            textAlign="right"
          />
        </View>

        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="email-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
          <TextInput
            style={styles.input}
            placeholder="البريد الإلكتروني..."
            placeholderTextColor={COLORS.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textAlign="right"
          />
        </View>

        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="phone-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
          <TextInput
            style={styles.input}
            placeholder="رقم الهاتف..."
            placeholderTextColor={COLORS.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            textAlign="right"
          />
        </View>

        <TouchableOpacity 
          style={styles.saveButton} 
          onPress={handleCreateCompany}
          disabled={submitting}>
          <MaterialCommunityIcons name="content-save-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.saveButtonText}>{submitting ? 'جاري الحفظ...' : 'حفظ الشركة'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={fetchCompanies}>
          <Text style={styles.refreshText}>تحديث القائمة</Text>
        </TouchableOpacity>
        <Text style={styles.subTitleHeader}>قائمة الشركات المسجلة</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.id ? item.id.toString() : Math.random().toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              
              {/* أيقونة ذهبية على اليسار (مثل النبتة في الصورة) */}
              <View style={styles.cardLeftIcon}>
                 <MaterialCommunityIcons name="domain" size={30} color={COLORS.primary} />
              </View>

              {/* نصوص تفاصيل الشركة في المنتصف */}
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                
                <Text style={styles.cardDetails}>
                  <MaterialCommunityIcons name="circle" size={8} color={item.email ? COLORS.success : COLORS.textMuted} />
                  {' '}البريد: {item.email || 'غير متوفر'}
                </Text>
                
                <Text style={styles.cardDetails}>
                  <MaterialCommunityIcons name="circle" size={8} color={item.phone ? COLORS.success : COLORS.textMuted} />
                  {' '}الهاتف: {item.phone || 'غير متوفر'}
                </Text>
              </View>

              {/* الدائرة البرونزية على اليمين */}
              <View style={styles.cardRightBadge}>
                <MaterialCommunityIcons name="shield-home-outline" size={24} color={COLORS.primary} />
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
  iconLeft: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: COLORS.textDark,
    paddingVertical: 12,
    fontSize: SIZES.font,
  },
  
  saveButton: {
    flexDirection: 'row-reverse', // لعكس اتجاه الأيقونة والنص
    backgroundColor: COLORS.primary, // اللون البرونزي
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
    backgroundColor: COLORS.background, // خلفية بيج فاتحة للأيقونة
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContent: {
    flex: 1,
    paddingHorizontal: 15,
  },
  cardTitle: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 6, textAlign: 'right' },
  cardDetails: { fontSize: SIZES.small, color: COLORS.textMuted, marginBottom: 3, textAlign: 'right' },
  
  cardRightBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});