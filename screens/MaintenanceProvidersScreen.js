// screens/MaintenanceProvidersScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, Alert } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function MaintenanceProvidersScreen() {
  // قائمة تبدأ فارغة تماماً
  const [providers, setProviders] = useState([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  // حقول الإدخال الجديدة المحددة
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [property, setProperty] = useState('');

  const handleOpenAddModal = () => {
    setEditingId(null);
    setName('');
    setPhone('');
    setLocation('');
    setProperty('');
    setModalVisible(true);
  };

  const handleOpenEditModal = (provider) => {
    setEditingId(provider.id);
    setName(provider.name);
    setPhone(provider.phone);
    setLocation(provider.location);
    setProperty(provider.property);
    setModalVisible(true);
  };

  const handleSaveProvider = () => {
    if (!name.trim() || !phone.trim() || !location.trim() || !property.trim()) {
      Alert.alert('تنبيه هام', 'الرجاء تعبئة جميع الحقول المطلوبة (الاسم، الرقم، المكان، والعقار التابع).');
      return;
    }

    if (editingId) {
      // تعديل مزود خدمة حالي
      setProviders(providers.map(p => p.id === editingId ? { ...p, name, phone, location, property } : p));
      Alert.alert('نجاح', 'تم تحديث بيانات مزود الخدمة بنجاح.');
    } else {
      // إضافة مزود خدمة جديد
      const newProvider = {
        id: Date.now().toString(),
        name,
        phone,
        location,
        property,
      };
      setProviders([newProvider, ...providers]);
      Alert.alert('نجاح', 'تم إضافة مزود الخدمة أو العامل الجديد بنجاح.');
    }

    setModalVisible(false);
  };

  const handleDeleteProvider = (id) => {
    Alert.alert(
      'تأكيد الحذف',
      'هل أنت متأكد من رغبتك في حذف هذا العنصر من النظام؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'حذف', style: 'destructive', onPress: () => setProviders(providers.filter(p => p.id !== id)) }
      ]
    );
  };

  return (
    <View style={styles.container}>
      
      {/* رأس الصفحة وزر الإضافة */}
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.addButton} onPress={handleOpenAddModal}>
          <MaterialCommunityIcons name="account-plus-outline" size={20} color="#FFFFFF" style={{ marginLeft: 6 }} />
          <Text style={styles.addButtonText}>إضافة عامل أو محل صيانة</Text>
        </TouchableOpacity>
      </View>

      {/* قائمة مزودي الخدمة (تظهر رسالة في حال كانت فارغة) */}
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {providers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="tools" size={48} color={COLORS.border} style={{ marginBottom: 10 }} />
            <Text style={styles.emptyText}>لا توجد أي طواقم أو محلات صيانة مسجلة حالياً.</Text>
            <Text style={styles.emptySubText}>قم بالضغط على زر "إضافة عامل أو محل صيانة" للبدء.</Text>
          </View>
        ) : (
          providers.map((provider) => (
            <View key={provider.id} style={styles.card}>
              <View style={styles.cardTopRow}>
                <View style={styles.actionsRow}>
                  <TouchableOpacity onPress={() => handleOpenEditModal(provider)} style={styles.actionIconBtn}>
                    <MaterialCommunityIcons name="pencil-outline" size={18} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteProvider(provider.id)} style={[styles.actionIconBtn, { marginRight: 8 }]}>
                    <MaterialCommunityIcons name="delete-outline" size={18} color="#DC2626" />
                  </TouchableOpacity>
                </View>

                <View style={styles.infoContainer}>
                  <Text style={styles.providerName}>{provider.name}</Text>
                  <Text style={styles.providerProperty}>العقار التابع: {provider.property}</Text>
                </View>
              </View>

              <View style={styles.cardFooterRow}>
                <View style={styles.metaBadge}>
                  <MaterialCommunityIcons name="map-marker-outline" size={14} color="#D97706" style={{ marginLeft: 4 }} />
                  <Text style={styles.metaText}>{provider.location}</Text>
                </View>

                <View style={styles.metaBadge}>
                  <MaterialCommunityIcons name="phone-outline" size={14} color={COLORS.primary} style={{ marginLeft: 4 }} />
                  <Text style={styles.metaText}>{provider.phone}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* نافذة الإضافة والتعديل المحدثة بالحقول المطلوبة */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{editingId ? 'تعديل بيانات العامل / المحل' : 'إضافة عامل أو محل صيانة جديد'}</Text>

            <Text style={styles.inputLabel}>اسم العامل أو المحل / الورشة</Text>
            <TextInput
              style={styles.textInput}
              placeholder="مثال: ورشة الفهد للكهرباء / أحمد الفني"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.inputLabel}>رقم الهاتف / التواصل</Text>
            <TextInput
              style={styles.textInput}
              placeholder="+968 9XXXXXXX"
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />

            <Text style={styles.inputLabel}>المكان / العنوان</Text>
            <TextInput
              style={styles.textInput}
              placeholder="مثال: الخوض التجارية، مسقط"
              placeholderTextColor="#9CA3AF"
              value={location}
              onChangeText={setLocation}
            />

            <Text style={styles.inputLabel}>العقار الذي يتبعه</Text>
            <TextInput
              style={styles.textInput}
              placeholder="مثال: برج ليوان الاستثماري (ب)"
              placeholderTextColor="#9CA3AF"
              value={property}
              onChangeText={setProperty}
            />

            <View style={styles.modalButtonsRow}>
              <TouchableOpacity style={styles.saveModalButton} onPress={handleSaveProvider}>
                <Text style={styles.saveModalButtonText}>حفظ البيانات</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.cancelModalButton} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelModalButtonText}>إلغاء</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  headerRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  titleContainer: { alignItems: 'flex-end' },
  title: { fontSize: 20, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'right' },
  subtitle: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, textAlign: 'right' },
  addButton: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    ...SHADOWS.floating,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    paddingHorizontal: 20,
  },
  emptyText: { fontSize: 14, fontWeight: 'bold', color: COLORS.textMuted, textAlign: 'center', marginBottom: 4 },
  emptySubText: { fontSize: 12, color: COLORS.border, textAlign: 'center' },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(182, 141, 106, 0.2)',
    ...SHADOWS.floating,
  },
  cardTopRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoContainer: { alignItems: 'flex-end', flex: 1 },
  providerName: { fontSize: 15, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'right' },
  providerProperty: { fontSize: 12, color: COLORS.primary, marginTop: 2, textAlign: 'right' },
  actionsRow: { flexDirection: 'row-reverse' },
  actionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardFooterRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'flex-start',
    borderTopWidth: 1,
    borderColor: 'rgba(182, 141, 106, 0.15)',
    paddingTop: 10,
  },
  metaBadge: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    marginLeft: 15,
  },
  metaText: { fontSize: 11, color: COLORS.textMuted },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: COLORS.card,
    borderRadius: SIZES.radius,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
    ...SHADOWS.floating,
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.textDark, textAlign: 'right', marginBottom: 15 },
  inputLabel: { fontSize: 12, fontWeight: 'bold', color: COLORS.textMuted, textAlign: 'right', marginBottom: 5 },
  textInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'right',
    color: COLORS.textDark,
    marginBottom: 12,
    fontSize: 13,
  },
  modalButtonsRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  saveModalButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginLeft: 8,
  },
  saveModalButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  cancelModalButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginRight: 8,
  },
  cancelModalButtonText: { color: COLORS.textMuted, fontWeight: 'bold', fontSize: 13 },
});