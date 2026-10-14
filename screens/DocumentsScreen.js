// screens/DocumentsScreen.js
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
  
  // نوافذ العرض والإدخال
  const [sourceModalVisible, setSourceModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [manualContractModal, setManualContractModal] = useState(false);
  const [manualCheckModal, setManualCheckModal] = useState(false);

  // حالة النص للمستندات المصورة
  const [editableContent, setEditableContent] = useState('');

  // حالات الإدخال اليدوي للعقود
  const [contractTitle, setContractTitle] = useState('');
  const [firstParty, setFirstParty] = useState('شركة عقارتك للاستثمار والتطوير B2B');
  const [secondParty, setSecondParty] = useState('');
  const [contractAmount, setContractAmount] = useState('');
  const [contractDetails, setContractDetails] = useState('');

  // حالات الإدخال اليدوي للشيكات
  const [checkNumber, setCheckNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [checkAmount, setCheckAmount] = useState('');
  const [checkDueDate, setCheckDueDate] = useState('');
  const [checkBeneficiary, setCheckBeneficiary] = useState('');

  // 1. التقاط صورة مستند
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
        setEditableContent(
`[بيانات المستند أو العقد المرصود]
- اسم المستند: عقد / فاتورة رسمية
- الطرف الأول: شركة عقارتك للاستثمار والتطوير B2B
- التفاصيل: تم رصد المستند بنجاح.`
        );
        setPreviewModalVisible(true);
      }
    } catch (error) {
      Alert.alert('خطأ', 'حدث خطأ أثناء التقاط الصورة');
    }
  };

  // 2. توليد PDF من الصورة المعدلة
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
              .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #96897F; border-top: 1px solid #D8CFC4; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">AqarTech B2B - النظام الرئيسي للعقارات</div>
              <div class="subtitle">سجل المستندات والعقود الرسمية المعتمدة</div>
            </div>
            <div class="content-box">${editableContent}</div>
            <div class="footer">تم إصدار هذا المستند وتوثيقه محلياً عبر تطبيق عقارتك • التاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
          </body>
        </html>
      `;

      const { uri: pdfUri } = await Print.printToFileAsync({ html: htmlContent });
      const newDoc = {
        id: Date.now().toString(),
        name: 'مستند_مصور_' + Date.now() + '.pdf',
        uri: pdfUri,
        type: 'مستند مصور موثق',
        date: new Date().toLocaleDateString('ar-EG'),
      };

      setDocuments([newDoc, ...documents]);
      setLoading(false);
      Alert.alert('نجاح', 'تم توليد وتوثيق ملف الـ PDF بنجاح!');
    } catch (error) {
      setLoading(false);
      Alert.alert('خطأ', 'تعذر توليد ملف الـ PDF');
    }
  };

  // 3. توليد PDF لعقد يدوي
  const generateManualContractPdf = async () => {
    if (!contractTitle || !secondParty || !contractAmount) {
      Alert.alert('تنبيه', 'الرجاء تعبئة الحقول الأساسية للعقد (عنوان العقد، الطرف الثاني، وقيمة العقد).');
      return;
    }

    try {
      setManualContractModal(false);
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
              .details-box { background: #FFFFFF; padding: 20px; border-radius: 10px; border: 1px solid #D8CFC4; font-size: 15px; line-height: 2.0; }
              .row { margin-bottom: 10px; border-bottom: 1px dashed #E0DCD5; padding-bottom: 5px; }
              .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #96897F; border-top: 1px solid #D8CFC4; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">AqarTech B2B - عقود الاستثمار العقاري</div>
              <div class="subtitle">${contractTitle}</div>
            </div>
            <div class="details-box">
              <div class="row"><b>الطرف الأول:</b> ${firstParty}</div>
              <div class="row"><b>الطرف الثاني:</b> ${secondParty}</div>
              <div class="row"><b>قيمة العقد / الاستثمار:</b> ${contractAmount}</div>
              <div class="row"><b>تفاصيل وبنود العقد:</b><br/>${contractDetails || 'لا توجد تفاصيل إضافية مسجلة.'}</div>
            </div>
            <div class="footer">تم إنشاء هذا العقد الآلي وتوثيقه رسمياً عبر منصة عقارتك • التاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
          </body>
        </html>
      `;

      const { uri: pdfUri } = await Print.printToFileAsync({ html: htmlContent });
      const newDoc = {
        id: Date.now().toString(),
        name: `عقد_${contractTitle}_${Date.now()}.pdf`,
        uri: pdfUri,
        type: 'عقد استثماري رسمي (إدخال يدوي)',
        date: new Date().toLocaleDateString('ar-EG'),
      };

      setDocuments([newDoc, ...documents]);
      setLoading(false);
      // إعادة تعيين الحقول
      setContractTitle(''); setSecondParty(''); setContractAmount(''); setContractDetails('');
      Alert.alert('نجاح تام', 'تم إصدار وتوثيق عقد الشركة الرسمي كملف PDF بنجاح!');
    } catch (error) {
      setLoading(false);
      Alert.alert('خطأ', 'تعذر إصدار عقد الـ PDF');
    }
  };

  // 4. توليد PDF لشيك يدوي
  const generateManualCheckPdf = async () => {
    if (!checkNumber || !bankName || !checkAmount || !checkDueDate) {
      Alert.alert('تنبيه', 'الرجاء تعبئة بيانات الشيك الأساسية (رقم الشيك، البنك، المبلغ، وتاريخ الاستحقاق).');
      return;
    }

    try {
      setManualCheckModal(false);
      setLoading(true);

      const htmlContent = `
        <html dir="rtl" lang="ar">
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Amiri', Arial, sans-serif; padding: 35px; color: #3E3228; background-color: #F5EFE6; }
              .header { text-align: center; border-bottom: 2px solid #27AE60; padding-bottom: 12px; margin-bottom: 25px; }
              .title { font-size: 22px; font-weight: bold; color: #27AE60; }
              .subtitle { font-size: 13px; color: #96897F; margin-top: 5px; }
              .details-box { background: #FFFFFF; padding: 20px; border-radius: 10px; border: 1px solid #D8CFC4; font-size: 15px; line-height: 2.0; }
              .row { margin-bottom: 10px; border-bottom: 1px dashed #E0DCD5; padding-bottom: 5px; }
              .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #96897F; border-top: 1px solid #D8CFC4; padding-top: 10px; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="title">AqarTech B2B - سجل الشيكات المالية والضمانات</div>
              <div class="subtitle">إيصال وتوثيق شيك بنكي معتمد</div>
            </div>
            <div class="details-box">
              <div class="row"><b>رقم الشيك:</b> ${checkNumber}</div>
              <div class="row"><b>البنك المسحب عليه:</b> ${bankName}</div>
              <div class="row"><b>المبلغ الإجمالي:</b> ${checkAmount}</div>
              <div class="row"><b>تاريخ الاستحقاق:</b> ${checkDueDate}</div>
              <div class="row"><b>المستفيد / الجهة:</b> ${checkBeneficiary || 'شركة عقارتك للاستثمار'}</div>
            </div>
            <div class="footer">تم اعتماد وتوثيق هذا الشيك المالي رقمياً عبر منصة عقارتك • التاريخ: ${new Date().toLocaleDateString('ar-EG')}</div>
          </body>
        </html>
      `;

      const { uri: pdfUri } = await Print.printToFileAsync({ html: htmlContent });
      const newDoc = {
        id: Date.now().toString(),
        name: `شيك_${checkNumber}_${Date.now()}.pdf`,
        uri: pdfUri,
        type: 'سند شيك بنكي رسمي (إدخال يدوي)',
        date: new Date().toLocaleDateString('ar-EG'),
      };

      setDocuments([newDoc, ...documents]);
      setLoading(false);
      // إعادة تعيين الحقول
      setCheckNumber(''); setBankName(''); setCheckAmount(''); setCheckDueDate(''); setCheckBeneficiary('');
      Alert.alert('نجاح تام', 'تم توثيق بيانات الشيك وإصدار ملف الـ PDF بنجاح!');
    } catch (error) {
      setLoading(false);
      Alert.alert('خطأ', 'تعذر إصدار شيك الـ PDF');
    }
  };

  const openPdf = async (pdfUri) => {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(pdfUri);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>إدارة العقود والشيكات والمستندات</Text>
      
      {/* أزرار العمليات المنفصلة */}
      <View style={styles.actionsGrid}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setManualContractModal(true)}>
          <MaterialCommunityIcons name="file-document-edit" size={22} color="#FFFFFF" style={{ marginLeft: 5 }} />
          <Text style={styles.actionBtnText}>إدخال عقد يدوي</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#27AE60' }]} onPress={() => setManualCheckModal(true)}>
          <MaterialCommunityIcons name="cash-multiple" size={22} color="#FFFFFF" style={{ marginLeft: 5 }} />
          <Text style={styles.actionBtnText}>إدخال شيك يدوي</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.mainUploadButton} onPress={() => setSourceModalVisible(true)}>
        <MaterialCommunityIcons name="camera-plus-outline" size={24} color="#FFFFFF" style={{ marginLeft: 8 }} />
        <Text style={styles.mainUploadButtonText}>تصوير مستند ورقي (كامرًا) وتحويله لـ PDF</Text>
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>جاري إصدار وتوثيق ملف الـ PDF الرسمي باسم الشركة...</Text>
        </View>
      )}

      {documents.length === 0 && !loading ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons name="folder-text-outline" size={50} color={COLORS.primary} style={{marginBottom: 15}} />
          <Text style={styles.cardTitle}>لا توجد عقود أو شيكات مسجلة حالياً</Text>
          <Text style={styles.cardDetails}>قم بإدخال بيانات العقود أو الشيكات يدوياً، أو صور المستندات لتحويلها تلقائياً إلى ملفات PDF رسمية.</Text>
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

      {/* نافذة اختيار الكاميرا للمستندات */}
      <Modal animationType="fade" transparent={true} visible={sourceModalVisible} onRequestClose={() => setSourceModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSourceModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>تصوير مستند ورقي</Text>
            <TouchableOpacity style={styles.modalOption} onPress={takePhoto}>
              <MaterialCommunityIcons name="camera-outline" size={24} color={COLORS.primary} />
              <Text style={styles.modalOptionText}>فتح الكاميرا الآن</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setSourceModalVisible(false)}>
              <Text style={styles.modalCancelText}>إلغاء</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* نافذة إدخال عقد يدوي */}
      <Modal animationType="slide" transparent={true} visible={manualContractModal} onRequestClose={() => setManualContractModal(false)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>إدخال بيانات عقد استثماري جديد</Text>
              <TouchableOpacity onPress={() => setManualContractModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, marginVertical: 10 }}>
              <Text style={styles.inputLabel}>عنوان العقد أو المشروع:</Text>
              <TextInput style={styles.inputBox} value={contractTitle} onChangeText={setContractTitle} placeholder="مثال: عقد إيجار وتطوير برج الأفق" placeholderTextColor="#96897F" />

              <Text style={styles.inputLabel}>الطرف الثاني (المستثمر / العميل):</Text>
              <TextInput style={styles.inputBox} value={secondParty} onChangeText={setSecondParty} placeholder="اسم الشركة أو الشخص الطرف الثاني" placeholderTextColor="#96897F" />

              <Text style={styles.inputLabel}>قيمة العقد المالية:</Text>
              <TextInput style={styles.inputBox} value={contractAmount} onChangeText={setContractAmount} placeholder="مثال: 50,000 ريال عماني" placeholderTextColor="#96897F" keyboardType="default" />

              <Text style={styles.inputLabel}>بنود وتفاصيل العقد:</Text>
              <TextInput style={[styles.inputBox, { height: 100, textAlignVertical: 'top' }]} multiline={true} value={contractDetails} onChangeText={setContractDetails} placeholder="اكتب شروط وبنود العقد هنا..." placeholderTextColor="#96897F" />
            </ScrollView>

            <TouchableOpacity style={styles.generateButton} onPress={generateManualContractPdf}>
              <MaterialCommunityIcons name="file-pdf-box" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
              <Text style={styles.generateButtonText}>إصدار وتوثيق العقد كـ PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* نافذة إدخال شيك يدوي */}
      <Modal animationType="slide" transparent={true} visible={manualCheckModal} onRequestClose={() => setManualCheckModal(false)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>إدخال بيانات شيك بنكي جديد</Text>
              <TouchableOpacity onPress={() => setManualCheckModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, marginVertical: 10 }}>
              <Text style={styles.inputLabel}>رقم الشيك:</Text>
              <TextInput style={styles.inputBox} value={checkNumber} onChangeText={setCheckNumber} placeholder="مثال: CHQ-988210" placeholderTextColor="#96897F" />

              <Text style={styles.inputLabel}>اسم البنك المسحب عليه:</Text>
              <TextInput style={styles.inputBox} value={bankName} onChangeText={setBankName} placeholder="مثال: بنك مسقط / بنك ظفار" placeholderTextColor="#96897F" />

              <Text style={styles.inputLabel}>مبلغ الشيك:</Text>
              <TextInput style={styles.inputBox} value={checkAmount} onChangeText={setCheckAmount} placeholder="مثال: 12,500 ر.ع" placeholderTextColor="#96897F" />

              <Text style={styles.inputLabel}>تاريخ الاستحقاق:</Text>
              <TextInput style={styles.inputBox} value={checkDueDate} onChangeText={setCheckDueDate} placeholder="مثال: 2026/12/31" placeholderTextColor="#96897F" />

              <Text style={styles.inputLabel}>المستفيد:</Text>
              <TextInput style={styles.inputBox} value={checkBeneficiary} onChangeText={setCheckBeneficiary} placeholder="شركة عقارتك للاستثمار" placeholderTextColor="#96897F" />
            </ScrollView>

            <TouchableOpacity style={[styles.generateButton, { backgroundColor: '#27AE60' }]} onPress={generateManualCheckPdf}>
              <MaterialCommunityIcons name="file-pdf-box" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
              <Text style={styles.generateButtonText}>إصدار وتوثيق الشيك كـ PDF</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* نافذة المعاينة للنصوص المصورة */}
      <Modal animationType="slide" transparent={true} visible={previewModalVisible} onRequestClose={() => setPreviewModalVisible(false)}>
        <View style={styles.previewOverlay}>
          <View style={styles.previewContainer}>
            <View style={styles.previewHeader}>
              <Text style={styles.previewTitle}>مراجعة وتعديل محتوى المستند المصور</Text>
              <TouchableOpacity onPress={() => setPreviewModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.textDark} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, marginVertical: 10 }}>
              <TextInput
                style={[styles.inputBox, { height: 200, textAlignVertical: 'top' }]}
                multiline={true}
                value={editableContent}
                onChangeText={setEditableContent}
                placeholder="عدل محتوى المستند هنا..."
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
  actionsGrid: { flexDirection: 'row-reverse', justifyContent: 'space-between', marginBottom: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.primary,
    padding: 12,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
    ...SHADOWS.floating,
  },
  actionBtnText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 13 },
  mainUploadButton: {
    flexDirection: 'row-reverse',
    backgroundColor: '#34495E',
    padding: 14,
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
  previewContainer: { backgroundColor: COLORS.card, borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, height: '80%', ...SHADOWS.floating },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  previewTitle: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark },
  inputLabel: { fontSize: 13, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 5, textAlign: 'right', marginTop: 10 },
  inputBox: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, borderRadius: SIZES.radius, padding: 12, fontSize: 14, color: COLORS.textDark, textAlign: 'right' },
  generateButton: { flexDirection: 'row-reverse', backgroundColor: COLORS.primary, padding: 15, borderRadius: SIZES.radius, alignItems: 'center', justifyContent: 'center', marginTop: 15, ...SHADOWS.floating },
  generateButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: SIZES.medium },
});