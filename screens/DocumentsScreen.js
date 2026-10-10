import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Modal, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export default function DocumentsScreen() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  
  // حالة النص المستخرج / القابل للتعديل اليدوي الدقيق
  const [editableContent, setEditableContent] = useState('');
  const [capturedImageUri, setCapturedImageUri] = useState('');

  // الخطوة 1: التقاط الصورة من الكاميرا
  const takePhoto = async () => {
    try {
      setSourceModalVisible(false);
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      
      if (!permissionResult.granted) {
        Alert.alert('تنبيه', 'يجب السماح باستخدام الكاميرا لالتقاط المستند');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const photoUri = result.assets[0].uri;
        setCapturedImageUri(photoUri);
        
        // تعيين نص افتراضي مرتب كقالب، ويمكن للمهندس تعديله بحرية مطابقة لما في الورقة
        setEditableContent(
`[بيانات المستند أو العقد المرصود]
- اسم المستند: عقد / فاتورة رسمية
- الطرف الأول: شركة عقارتك للاستثمار والتطوير B2B
- البنود والتفاصيل:
  1. بند الإيجار أو الخدمة: تم رصد القيمة بدقة.
  2. الشروط والأحكام: مطابقة للمواصفات المعتمدة.
- الملاحظات: تم توثيق المستند بنجاح.`
        );

        // فتح نافذة المعاينة والتعديل اليدوي الدقيق
        setPreviewModalVisible(true);
      }
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ أثناء التقاط الصورة');
    }
  };

  // الخطوة 2: تأكيد النص وتوليد ملف الـ PDF المرتب
  const generateFinalPdf = async () => {
    try {
      setPreviewModalVisible(false);
      setLoading(true);

      const htmlContent = `
        <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Amiri', Arial, sans-serif; padding: 35px; color: #3E3228; background-color: #F5EFE6; }
              .header { text-align: center; border-bottom: 2px solid #B68D6A; padding-bottom: 12px; margin-bottom: 25px; }
              .title { font-size: 22px; font-weight: bold; color: #B68D6A; }
              .subtitle { font-size: 13px; color: #96897F; margin-top: 5px; }
              .content-box { background: #FFFFFF; padding: 20px; border-radius: 10px; border: 1px solid #D8CFC4; font-size: 15px; white-space: pre-wrap; line-height: 1.8; }
              .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #96897F; border-top: 1px solid #D8CFC4; pt: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">AqarTech B2B - النظام الرئسي للمستندات</div>
              <div class="subtitle">سجل الموثقات والعقود الرسمية المعتمدة</div>
            </div>

            <div class="content-box">
              ${editableContent}
            </div>

            <div class="footer">
              تم إصدار هذا المستند وتوثيقه محلياً عبر تطبيق عقارتك • التاريخ: ${new Date().toLocaleDateString('ar-EG')}
            </div>
          </body>
        </html>
      `;

      const { uri: pdfUri } = await Print.printToFileAsync({ html: htmlContent });

      const newDoc = {
        id: Date.now().toString(),
        name: 'مستند_عقارتك_' + Date.now() + '.pdf',
        uri: pdfUri,
        type: 'PDF رسمي موثق محلياً',
        date: new Date().toLocaleDateString('ar-EG'),
      };

      setDocuments([newDoc, ...documents]);
      setLoading(false);
      Alert.alert('نجاح تام', 'تم توليد وتوثيق ملف الـ PDF بنجاح وزر الإرسال جاهز!');
    } catch (error) {
      setLoading(false);
      Alert.alert('خطأ', 'تعذر توليد ملف الـ PDF');
    }
  };

  const openPdf = async (pdfUri) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(pdfUri);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إدارة المستندات والعقود (الضبط الدقيق)</Text>
      
      <TouchableOpacity style={styles.mainUploadButton} onPress={() => setSourceModalVisible(true)}>
        <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#FFFFFF" style={{ marginLeft: 8 }} />
        <Text style={styles.mainUploadButtonText}>تصوير مستند جديد وتوثيقه كـ PDF</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>جاري تجهيز وتنسيق ملف الـ PDF الرسمي...</Text>
        </View>
      )}

      {documents.length === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="folder-text-outline" size={50} color={COLORS.primary} style={{marginBottom: 15}} />
          <Text style={styles.cardTitle}>لا توجد مستندات مسجلة حالياً</Text>
          <Text style={styles.cardDetails}>صور أي مستند ورقي، راجع نصوصه وتعديلها بدقة، ثم حوله مباشرة إلى PDF احترافي.</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.docCard} onPress={() => openPdf(item.uri)}>
              <View style={styles.docIconBox}>
                <MaterialCommunityIcons name="file-pdf-box" size={32} color="#E74C3C" />
              </View>
              <View style={styles.docInfo}>
                <Text style={styles.docName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.docType}>{item.type} • {item.date}</Text>
                <Text style={styles.docStatus}>اضغط لعرض أو مشاركة الـ PDF 📄</Text>
              </View>
              <MaterialCommunityIcons name="chevron-left" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}

      {/* نافذة اختيار مصدر المستند (كاميرا) */}
      <Modal animationType="fade" transparent={true} visible={sourceModalVisible} onRequestClose={() => setSourceModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSourceModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>مصدر المستند الورقي</Text>
            
            <TouchableOpacity style={styles.modalOption} onPress={takePhoto}>
              <MaterialCommunityIcons name="camera-outline" size={24} color={COLORS.primary} />
              <Text style={styles.modalOptionText}>التقاط صورة بالكاميرا</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancel} onPress={() => setSourceModalVisible(false)}>
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* نافذة المعاينة والتعديل الدقيق للنصوص قبل توليد الـ PDF */}
      <Modal animationType="slide" transparent={true} visible={previewModalVisible} onRequestClose={() => setPreviewModalVisible(false)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>مراجعة وتعديل محتوى المستند</Text>
              <TouchableOpacity onPress={() => setPreviewModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <Text style={styles.previewSubTitle}>قم بمراجعة أو تعديل النصوص والجداول لتظهر بدقة 100% في ملف الـ PDF:</Text>

            <ScrollView style={{ width: '100%', flex: 1, marginVertical: 10 }}>
              <TextInput
                style={styles.textInputArea}
                multiline={true}
                value={editableContent}
                onChangeText={setEditableContent}
                placeholder="اكتب أو عدل محتوى المستند هنا..."
                placeholderTextColor="#96897F"
              />
            </ScrollView>

            <TouchableOpacity style={styles.generateButton} onPress={generateFinalPdf}>
              <MaterialCommunityIcons name="check-decagram" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
              <Text style={styles.generateButtonText}>توليد ملف الـ PDF الرسمي الآن</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SIZES.padding, backgroundColor: COLORS.background },
  title: { fontSize: SIZES.large, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 15, textAlign: 'right' },
  mainUploadButton: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.primary,
    padding: 15,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...SHADOWS.floating,
  },
  mainUploadButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: SIZES.medium },
  loadingContainer: { alignItems: 'center', marginVertical: 20 },
  loadingText: { color: COLORS.textMuted, marginTop: 8, fontSize: SIZES.small, textAlign: 'center' },
  emptyCard: { backgroundColor: COLORS.card, padding: 30, borderRadius: SIZES.radius, alignItems: 'center', ...SHADOWS.floating, marginTop: 10 },
  cardTitle: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 10 },
  cardDetails: { fontSize: SIZES.font, color: COLORS.textMuted, marginBottom: 10, textAlign: 'center' },
  docCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 14,
    borderRadius: SIZES.radius,
    marginBottom: 10,
    ...SHADOWS.floating,
  },
  docIconBox: { width: 45, height: 45, borderRadius: 22.5, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  docInfo: { flex: 1, paddingHorizontal: 12, alignItems: 'flex-end' },
  docName: { fontSize: SIZES.font, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 2 },
  docType: { fontSize: 12, color: COLORS.textMuted, marginBottom: 2 },
  docStatus: { fontSize: 11, color: COLORS.primary, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: COLORS.card, borderRadius: SIZES.radius, padding: 20, alignItems: 'center', ...SHADOWS.floating },
  modalTitle: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 20 },
  modalOption: { flexDirection: 'row-reverse', alignItems: 'center', width: '100%', padding: 15, borderRadius: 15, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12, backgroundColor: COLORS.background },
  modalOptionText: { fontSize: SIZES.font, fontWeight: 'bold', color: COLORS.textDark, marginRight: 12 },
  modalCancel: { marginTop: 5, padding: 10 },
  modalCancelText: { color: COLORS.textMuted, fontWeight: 'bold', fontSize: SIZES.font },
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  previewContainer: { backgroundColor: COLORS.card, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, height: '75%', ...SHADOWS.floating },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  previewTitle: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark },
  previewSubTitle: { fontSize: 12, color: COLORS.textMuted, textAlign: 'right', marginBottom: 10 },
  textInputArea: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radius, padding: 15, fontSize: 14, color: COLORS.textDark, textAlign: 'right', minHeight: 200, textAlignVertical: 'top' },
  generateButton: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, padding: 15, borderRadius: SIZES.radius, alignItems: 'center', justifyContent: 'center', marginTop: 15, ...SHADOWS.floating },
  generateButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: SIZES.medium },
});