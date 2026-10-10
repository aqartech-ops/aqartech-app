// screens/UsersScreen.js
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert, TextInput } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme'; 
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function UsersScreen() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const API_URL = 'http://192.168.1.123:3000/user';

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      const data = await response.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      Alert.alert('تنبيه', 'تعذر الاتصال بالخادم لجلب المستخدمين');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!name.trim()) return Alert.alert('تنبيه', 'الرجاء إدخال اسم المستخدم');
    
    const userEmail = (email && email.includes('@')) ? email : `${name.toLowerCase().replace(/\s+/g, '')}_${Date.now()}@aqartech.com`;

    try {
      setSubmitting(true);
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          email: userEmail, 
          phone: phone || null,
          password: "DefaultPassword123",
          companyId: null,
          roleId: null
        }),
      });

      if (response.ok) {
        Alert.alert('نجاح', 'تمت إضافة المستخدم بنجاح!');
        setName(''); setEmail(''); setPhone('');
        fetchUsers();
      } else {
        const errorText = await response.text();
        Alert.alert('خطأ', `فشل حفظ المستخدم: ${errorText}`);
      }
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ أثناء الاتصال بالخادم');
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إدارة المستخدمين</Text>
      
      <View style={styles.formContainer}>
        <View style={styles.inputWrapper}>
          <MaterialCommunityIcons name="account-outline" size={22} color={COLORS.primary} style={styles.iconLeft} />
          <TextInput 
            style={styles.input} 
            placeholder="اسم المستخدم..." 
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

        <TouchableOpacity style={styles.saveButton} onPress={handleCreateUser} disabled={submitting}>
          <MaterialCommunityIcons name="account-plus-outline" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
          <Text style={styles.saveButtonText}>{submitting ? 'جاري الحفظ...' : 'حفظ المستخدم'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.headerRow}>
        <TouchableOpacity onPress={fetchUsers}>
          <Text style={styles.refreshText}>تحديث القائمة</Text>
        </TouchableOpacity>
        <Text style={styles.subTitleHeader}>قائمة المستخدمين</Text>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.id ? item.id.toString() : Math.random().toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardLeftIcon}>
                <MaterialCommunityIcons name="account-circle-outline" size={30} color={COLORS.primary} />
              </View>
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle}>{item.name}</Text>
                <Text style={styles.cardDetails}>البريد: {item.email || 'غير متوفر'}</Text>
                <Text style={styles.cardDetails}>الهاتف: {item.phone || 'غير متوفر'}</Text>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: SIZES.padding }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: SIZES.padding, 
    backgroundColor: COLORS.background 
  },
  title: { 
    fontSize: SIZES.large, 
    fontWeight: 'bold', 
    color: COLORS.textDark, 
    marginBottom: 15, 
    textAlign: 'right' 
  },
  formContainer: { 
    backgroundColor: COLORS.card, 
    padding: 18, 
    borderRadius: SIZES.radius, 
    marginBottom: SIZES.padding, 
    ...SHADOWS.floating 
  },
  inputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'transparent', 
    borderRadius: SIZES.radius, 
    marginBottom: 12, 
    paddingHorizontal: 15, 
    borderWidth: 1, 
    borderColor: COLORS.border 
  },
  iconLeft: { 
    marginRight: 10 
  },
  input: { 
    flex: 1, 
    color: COLORS.textDark, 
    paddingVertical: 12, 
    fontSize: SIZES.font 
  },
  saveButton: { 
    flexDirection: 'row-reverse', 
    backgroundColor: COLORS.primary, 
    padding: 15, 
    borderRadius: SIZES.radius, 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginTop: 8 
  },
  saveButtonText: { 
    color: '#FFFFFF', 
    fontWeight: 'bold', 
    fontSize: SIZES.medium 
  },
  headerRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginBottom: 12 
  },
  subTitleHeader: { 
    fontSize: SIZES.medium, 
    fontWeight: 'bold', 
    color: COLORS.textDark 
  },
  refreshText: { 
    color: COLORS.textMuted, 
    fontSize: SIZES.small 
  },
  centerContainer: { 
    padding: SIZES.padding, 
    alignItems: 'center' 
  },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: COLORS.card, 
    padding: 15, 
    borderRadius: SIZES.radius, 
    marginBottom: 12, 
    ...SHADOWS.floating 
  },
  cardLeftIcon: { 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    backgroundColor: COLORS.background, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  cardContent: { 
    flex: 1, 
    paddingHorizontal: 15 
  },
  cardTitle: { 
    fontSize: SIZES.medium, 
    fontWeight: 'bold', 
    color: COLORS.textDark, 
    marginBottom: 6, 
    textAlign: 'right' 
  },
  cardDetails: { 
    fontSize: SIZES.small, 
    color: COLORS.textMuted, 
    marginBottom: 3, 
    textAlign: 'right' 
  },
});