import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { getCompanies, createCompany } from './services/api';

export default function App() {
  const [companies, setCompanies] = useState([]);
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // جلب الشركات من الخادم
  const fetchCompanies = async () => {
    setLoading(true);
    const data = await getCompanies();
    setCompanies(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  // إضافة شركة جديدة وتخزينها في قاعدة البيانات
  const handleAddCompany = async () => {
    if (!companyName.trim()) return;

    setSubmitting(true);
    // بناءً على هيكل الـ DTO لديك، غالباً الحقل المطلوب هو name (أو أضف حقول أخرى إن وجدت)
    const newCompany = await createCompany({ name: companyName });
    
    if (newCompany) {
      setCompanyName(''); // تفريغ حقل الإدخال
      fetchCompanies();   // إعادة جلب القائمة لتحديث العرض وتأكيد التخزين
    }
    setSubmitting(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>إدارة الشركات (AqarTech)</Text>

      {/* قسم الإدخال والتخزين */}
      <View style={styles.formContainer}>
        <TextInput
          style={styles.input}
          placeholder="أدخل اسم الشركة الجديدة..."
          placeholderTextColor="#888"
          value={companyName}
          onChangeText={setCompanyName}
        />
        <TouchableOpacity style={styles.button} onPress={handleAddCompany} disabled={submitting}>
          <Text style={styles.buttonText}>{submitting ? 'جاري الحفظ...' : 'حفظ في القاعدة'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subTitle}>الشركات المخزنة حالياً في قاعدة البيانات:</Text>

      {/* عرض القائمة */}
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={{ marginTop: 20 }} />
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => (item.id ? item.id.toString() : Math.random().toString())}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.itemText}>{item.name}</Text>
              <Text style={styles.itemIdText}>ID: {item.id}</Text>
            </View>
          )}
          ListEmptyComponent={
            <Text style={styles.emptyText}>لا توجد شركات مسجلة حتى الآن.</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#f8f9fa' },
  headerTitle: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333' },
  formContainer: { marginBottom: 20 },
  input: { 
    backgroundColor: '#fff', 
    padding: 12, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#ddd', 
    marginBottom: 10,
    fontSize: 16,
    textAlign: 'right'
  },
  button: { 
    backgroundColor: '#007AFF', 
    padding: 12, 
    borderRadius: 8, 
    alignItems: 'center' 
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  subTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#555' },
  item: { 
    padding: 15, 
    backgroundColor: '#fff', 
    marginBottom: 10, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#eee',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  itemText: { fontSize: 16, color: '#333', fontWeight: '500' },
  itemIdText: { fontSize: 12, color: '#888' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 20 }
});