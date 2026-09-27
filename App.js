import React, { useEffect, useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  FlatList, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  StatusBar,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
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
    const newCompany = await createCompany({ name: companyName });
    
    if (newCompany) {
      setCompanyName(''); 
      fetchCompanies();   
    }
    setSubmitting(false);
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
      style={styles.container}
    >
      <StatusBar barStyle="light-content" backgroundColor="#121212" />
      
      {/* رأس التطبيق الفخم */}
      <View style={styles.headerContainer}>
        <Text style={styles.headerBrand}>AQARTECH</Text>
        <Text style={styles.headerSubtitle}>منظومة إدارة الشركات العقارية</Text>
      </View>

      {/* قسم الإدخال الفاخر */}
      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>إضافة شركة جديدة</Text>
        <TextInput
          style={styles.input}
          placeholder="أدخل اسم الشركة العقارية..."
          placeholderTextColor="#777"
          value={companyName}
          onChangeText={setCompanyName}
        />
        <TouchableOpacity 
          style={[styles.button, submitting && styles.buttonDisabled]} 
          onPress={handleAddCompany} 
          disabled={submitting}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'جاري الحفظ...' : 'حفظ في النظام'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.listTitle}>الشركات المسجلة مسبقاً</Text>

      {/* عرض القائمة */}
      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => (item.id ? item.id.toString() : Math.random().toString())}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <View style={styles.itemCard}>
              <View style={styles.itemBadge}>
                <Text style={styles.itemBadgeText}>#{index + 1}</Text>
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemText}>{item.name}</Text>
                <Text style={styles.itemIdText}>معرف النظام (ID): {item.id}</Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>لا توجد شركات مسجلة في القاعدة حالياً.</Text>
            </View>
          }
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#121212', 
    paddingHorizontal: 20, 
    paddingTop: 50 
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 25,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    paddingBottom: 15,
  },
  headerBrand: { 
    fontSize: 26, 
    fontWeight: '900', 
    color: '#D4AF37', 
    letterSpacing: 2 
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    letterSpacing: 1
  },
  cardSection: {
    backgroundColor: '#1E1E1E',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#E0E0E0',
    marginBottom: 12,
    textAlign: 'right'
  },
  input: { 
    backgroundColor: '#262626', 
    paddingHorizontal: 16,
    paddingVertical: 12, 
    borderRadius: 8, 
    borderWidth: 1, 
    borderColor: '#383838', 
    marginBottom: 14,
    fontSize: 15,
    color: '#FFF',
    textAlign: 'right'
  },
  button: { 
    backgroundColor: '#D4AF37', 
    paddingVertical: 13, 
    borderRadius: 8, 
    alignItems: 'center',
    shadowColor: '#D4AF37',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  buttonDisabled: {
    backgroundColor: '#8C7823',
  },
  buttonText: { 
    color: '#121212', 
    fontSize: 16, 
    fontWeight: 'bold',
    letterSpacing: 0.5 
  },
  listTitle: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    marginBottom: 12, 
    color: '#D4AF37',
    textAlign: 'right'
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  itemCard: { 
    padding: 16, 
    backgroundColor: '#1A1A1A', 
    marginBottom: 12, 
    borderRadius: 10, 
    borderWidth: 1, 
    borderColor: '#2D2D2D',
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  itemBadge: {
    backgroundColor: '#262626',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#383838'
  },
  itemBadgeText: {
    color: '#D4AF37',
    fontSize: 12,
    fontWeight: 'bold'
  },
  itemInfo: {
    flex: 1,
    alignItems: 'flex-end',
    marginRight: 12
  },
  itemText: { 
    fontSize: 16, 
    color: '#F5F5F5', 
    fontWeight: '600',
    marginBottom: 4 
  },
  itemIdText: { 
    fontSize: 11, 
    color: '#777' 
  },
  emptyContainer: {
    padding: 30,
    alignItems: 'center'
  },
  emptyText: { 
    textAlign: 'center', 
    color: '#666', 
    fontSize: 14 
  }
});