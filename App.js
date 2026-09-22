import React, { useState } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  SafeAreaView,
  StatusBar,
  Alert,
  ScrollView
} from 'react-native';

export default function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [propertyName, setPropertyName] = useState('');
  const [propertyPrice, setPropertyPrice] = useState('');
  const [propertyType, setPropertyType] = useState('سكني');
  const [selectedCategory, setSelectedCategory] = useState('الكل');
  
  const [properties, setProperties] = useState([
    { id: '1', name: 'فيلا مودرن - الشاطئ', price: '120,000', status: 'مؤجر', category: 'سكني' },
    { id: '2', name: 'شقة سكنية - الموالح', price: '45,000', status: 'متاح', category: 'سكني' },
    { id: '3', name: 'مبنى تجاري - الخوير', price: '350,000', status: 'متاح', category: 'تجاري' },
    { id: '4', name: 'مكتب راقي - القرم', price: '85,000', status: 'مؤجر', category: 'تجاري' },
  ]);

  // ألوان الثيمات
  const theme = {
    bg: isDarkMode ? '#0f172a' : '#f8fafc',
    cardBg: isDarkMode ? '#1e293b' : '#ffffff',
    textMain: isDarkMode ? '#f8fafc' : '#0f172a',
    textSub: isDarkMode ? '#94a3b8' : '#64748b',
    border: isDarkMode ? '#334155' : '#e2e8f0',
    inputBg: isDarkMode ? '#334155' : '#f1f5f9',
  };

  // إضافة عقار جديد
  const handleAddProperty = () => {
    if (!propertyName.trim() || !propertyPrice.trim()) {
      Alert.alert('تنبيه', 'يرجى إدخال اسم العقار والسعر');
      return;
    }

    const newProperty = {
      id: Date.now().toString(),
      name: propertyName,
      price: Number(propertyPrice).toLocaleString(),
      status: 'متاح',
      category: propertyType,
    };

    setProperties([newProperty, ...properties]);
    setPropertyName('');
    setPropertyPrice('');
  };

  // تغيير حالة العقار
  const togglePropertyStatus = (id) => {
    setProperties(properties.map(item => {
      if (item.id === id) {
        return { ...item, status: item.status === 'متاح' ? 'مؤجر' : 'متاح' };
      }
      return item;
    }));
  };

  // حذف عقار
  const handleDeleteProperty = (id) => {
    Alert.alert('حذف عقار', 'هل أنت تأكد من رغبتك في حذف هذا العقار؟', [
      { text: 'إلغاء', style: 'cancel' },
      { 
        text: 'حذف', 
        style: 'destructive', 
        onPress: () => setProperties(properties.filter(p => p.id !== id)) 
      },
    ]);
  };

  // الإحصائيات
  const totalProperties = properties.length;
  const rentedProperties = properties.filter(p => p.status === 'مؤجر').length;
  const availableProperties = properties.filter(p => p.status === 'متاح').length;
  const occupancyRate = totalProperties > 0 ? Math.round((rentedProperties / totalProperties) * 100) : 0;

  // التصفية والبحث
  const filteredProperties = properties.filter(item => {
    const matchesCategory = selectedCategory === 'الكل' || item.status === selectedCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDarkMode ? "light-content" : "dark-content"} backgroundColor={theme.bg} />
      
      {/* هيدر المعرض المميز بدون استخدام صور */}
      <View style={styles.headerContainer}>
        <TouchableOpacity 
          style={[styles.themeToggleBtn, { backgroundColor: theme.cardBg, borderColor: theme.border }]} 
          onPress={() => setIsDarkMode(!isDarkMode)}
        >
          <Text style={{ fontSize: 18 }}>{isDarkMode ? '☀️' : '🌙'}</Text>
        </TouchableOpacity>

        {/* عنوان وايقونة اسم الشركة بالمنتصف */}
        <View style={styles.brandCenterContainer}>
          <View style={styles.brandIconBox}>
            <Text style={styles.brandIconText}>🏢</Text>
          </View>
          <Text style={[styles.brandTitle, { color: theme.textMain }]}>AQARTECH</Text>
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredBadgeText}>✨ معرض متميز</Text>
          </View>
        </View>

        <View style={{ width: 44 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        
        {/* شريط نسبة الإشغال */}
        <View style={[styles.occupancyCard, { backgroundColor: '#2563eb' }]}>
          <View style={styles.occupancyHeader}>
            <Text style={styles.occupancyTitle}>نسبة إشغال المحفظة</Text>
            <Text style={styles.occupancyPercent}>{occupancyRate}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${occupancyRate}%` }]} />
          </View>
          <Text style={styles.occupancySub}>تم تأجير {rentedProperties} من أصل {totalProperties} عقار</Text>
        </View>

        {/* بطاقات الإحصائيات */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: isDarkMode ? '#1e293b' : '#0f172a' }]}>
            <Text style={[styles.statNumber, { color: '#ffffff' }]}>{totalProperties}</Text>
            <Text style={[styles.statLabel, { color: '#94a3b8' }]}>الإجمالي</Text>
          </View>
          
          <View style={[styles.statCard, { backgroundColor: '#dcfce7' }]}>
            <Text style={[styles.statNumber, { color: '#166534' }]}>{rentedProperties}</Text>
            <Text style={[styles.statLabel, { color: '#15803d' }]}>مؤجرة</Text>
          </View>

          <View style={[styles.statCard, { backgroundColor: '#e0f2fe' }]}>
            <Text style={[styles.statNumber, { color: '#0369a1' }]}>{availableProperties}</Text>
            <Text style={[styles.statLabel, { color: '#0284c7' }]}>متاحة</Text>
          </View>
        </View>

        {/* نموذج إضافة عقار */}
        <View style={[styles.cardForm, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
          <Text style={[styles.formTitle, { color: theme.textMain }]}>✨ إضافة عقار جديد</Text>
          
          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.textMain }]}
            placeholder="اسم العقار أو الموقع"
            value={propertyName}
            onChangeText={setPropertyName}
            placeholderTextColor={theme.textSub}
          />

          <TextInput
            style={[styles.input, { backgroundColor: theme.inputBg, color: theme.textMain }]}
            placeholder="السعر (ر.ع)"
            keyboardType="numeric"
            value={propertyPrice}
            onChangeText={setPropertyPrice}
            placeholderTextColor={theme.textSub}
          />

          <View style={styles.typeSelector}>
            {['سكني', 'تجاري'].map((type) => (
              <TouchableOpacity 
                key={type}
                style={[
                  styles.typeBtn, 
                  { backgroundColor: propertyType === type ? '#2563eb' : theme.inputBg }
                ]}
                onPress={() => setPropertyType(type)}
              >
                <Text style={{ color: propertyType === type ? '#ffffff' : theme.textSub, fontWeight: 'bold' }}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.addButton} onPress={handleAddProperty}>
            <Text style={styles.addButtonText}>+ حفظ العقار</Text>
          </TouchableOpacity>
        </View>

        {/* شريط البحث والتصفية */}
        <View style={styles.searchSection}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textMain }]}
            placeholder="🔍 ابحث عن عقار..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={theme.textSub}
          />

          <View style={styles.filterRow}>
            {['الكل', 'متاح', 'مؤجر'].map((tab) => (
              <TouchableOpacity 
                key={tab} 
                style={[
                  styles.filterTab, 
                  selectedCategory === tab && styles.filterTabActive,
                  { backgroundColor: selectedCategory === tab ? '#2563eb' : theme.cardBg }
                ]}
                onPress={() => setSelectedCategory(tab)}
              >
                <Text style={[
                  styles.filterText, 
                  { color: selectedCategory === tab ? '#ffffff' : theme.textSub }
                ]}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* قائمة العقارات */}
        <View style={styles.listHeader}>
          <Text style={[styles.sectionTitle, { color: theme.textMain }]}>العقارات ({filteredProperties.length})</Text>
          <Text style={{ fontSize: 11, color: theme.textSub }}>انقر المربع لتغيير الحالة</Text>
        </View>

        {filteredProperties.map((item) => (
          <View key={item.id} style={[styles.propertyCard, { backgroundColor: theme.cardBg, borderColor: theme.border }]}>
            <View style={styles.propertyInfo}>
              <View style={styles.titleRow}>
                <Text style={[styles.propertyName, { color: theme.textMain }]}>{item.name}</Text>
                
                <TouchableOpacity onPress={() => togglePropertyStatus(item.id)}>
                  <View style={[styles.badge, item.status === 'مؤجر' ? styles.badgeRented : styles.badgeAvailable]}>
                    <Text style={[styles.badgeText, item.status === 'مؤجر' ? styles.badgeTextRented : styles.badgeTextAvailable]}>
                      {item.status}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={styles.categoryBadge}>
                  <Text style={styles.categoryBadgeText}>{item.category}</Text>
                </View>
              </View>

              <Text style={[styles.propertyPrice, { color: theme.textSub }]}>{item.price} ر.ع.</Text>
            </View>

            <TouchableOpacity 
              style={styles.deleteButton} 
              onPress={() => handleDeleteProperty(item.id)}
            >
              <Text style={styles.deleteButtonText}>🗑️</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 20 },
  
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  brandCenterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  brandIconText: {
    fontSize: 22,
  },
  brandTitle: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 2,
  },
  featuredBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginTop: 3,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#b45309',
  },
  themeToggleBtn: { 
    width: 44, 
    height: 44, 
    borderRadius: 22, 
    borderWidth: 1, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  
  occupancyCard: { padding: 18, borderRadius: 16, marginBottom: 16 },
  occupancyHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center' },
  occupancyTitle: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  occupancyPercent: { color: '#ffffff', fontWeight: 'bold', fontSize: 20 },
  progressBarBg: { height: 8, backgroundColor: 'rgba(255, 255, 255, 0.3)', borderRadius: 4, marginVertical: 10 },
  progressBarFill: { height: '100%', backgroundColor: '#ffffff', borderRadius: 4 },
  occupancySub: { color: '#e0e7ff', fontSize: 12, textAlign: 'right' },

  statsRow: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 16 },
  statCard: { flex: 1, marginHorizontal: 3, padding: 12, borderRadius: 12, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: 'bold' },
  statLabel: { fontSize: 11, marginTop: 2, fontWeight: '600' },

  cardForm: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16 },
  formTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12, textAlign: 'right' },
  input: { borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 10, textAlign: 'right' },
  typeSelector: { flexDirection: 'row-reverse', gap: 10, marginBottom: 12 },
  typeBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  addButton: { backgroundColor: '#2563eb', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  addButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

  searchSection: { marginBottom: 16 },
  searchInput: { borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, textAlign: 'right', marginBottom: 10 },
  filterRow: { flexDirection: 'row-reverse', gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  filterText: { fontSize: 12, fontWeight: '600' },

  listHeader: { flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  propertyCard: { padding: 14, borderRadius: 12, flexDirection: 'row-reverse', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderWidth: 1 },
  propertyInfo: { flex: 1 },
  titleRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6 },
  propertyName: { fontSize: 14, fontWeight: '700' },
  propertyPrice: { fontSize: 12, marginTop: 4, textAlign: 'right' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeAvailable: { backgroundColor: '#e0f2fe' },
  badgeRented: { backgroundColor: '#fef3c7' },
  badgeText: { fontSize: 11, fontWeight: 'bold' },
  badgeTextAvailable: { color: '#0369a1' },
  badgeTextRented: { color: '#b45309' },
  categoryBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  categoryBadgeText: { fontSize: 10, color: '#475569' },
  deleteButton: { padding: 6, backgroundColor: '#fef2f2', borderRadius: 8, marginLeft: 10 },
  deleteButtonText: { fontSize: 14 },
});