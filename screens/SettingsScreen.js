// screens/SettingsScreen.js
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView, Alert } from 'react-native';
import { COLORS, SIZES, SHADOWS } from '../theme';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function SettingsScreen() {
  // حالات الإعدادات والتفضيلات
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [biometricLogin, setBiometricLogin] = useState(false);
  const [highSecurityMode, setHighSecurityMode] = useState(true);

  // دوال التفاعل مع الأزرار والإعدادات
  const handleBackup = () => {
    Alert.alert(
      'النسخ الاحتياطي السحابي',
      'هل تريد إنشاء نسخة احتياطية فورية لبيانات الشركات والعقود والمالية؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'بدء النسخ', onPress: () => Alert.alert('نجاح', 'تم رفع النسخة الاحتياطية بنجاح إلى السحابة الآمنة.') }
      ]
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'تنظيف الذاكرة المؤقتة',
      'هل تريد مسح الملفات المؤقتة والذاكرة المؤقتة لتحسين أداء التطبيق؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'تنظيف', style: 'destructive', onPress: () => Alert.alert('تم', 'تم تفريغ الذاكرة المؤقتة بنجاح.') }
      ]
    );
  };

  const handleLanguageChange = () => {
    Alert.alert('اللغة', 'لغة التطبيق الحالية هي العربية (الافتراضية). سيتم دعم لغات أخرى قريباً.');
  };

  const handleLogout = () => {
    Alert.alert(
      'تسجيل الخروج',
      'هل أنت متأكد من رغبتك في تسجيل الخروج من نظام AqarTech B2B؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        { text: 'خروج', style: 'destructive', onPress: () => Alert.alert('تنبيه', 'تم تسجيل الخروج بنجاح.') }
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 30 }}>
      <Text style={styles.title}>الإعدادات والتحكم بالنظام</Text>

      {/* قسم الحساب والملف الشخصي */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>إدارة الحساب</Text>
        
        <View style={styles.profileCard}>
          <View style={styles.avatarBox}>
            <MaterialCommunityIcons name="account-tie" size={32} color={COLORS.primary} />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>المهندس رضوان الهنائي</Text>
            <Text style={styles.profileRole}>المدير التنفيذي للأنظمة • AqarTech B2B</Text>
          </View>
        </View>
      </View>

      {/* قسم التفضيلات والأمان */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>الأمان والخصوصية</Text>

        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>تسجيل الدخول بالبصمة / الوجه</Text>
            <Text style={styles.settingSubtitle}>تأمين فتح التطبيق بالبيانات الحيوية</Text>
          </View>
          <Switch
            value={biometricLogin}
            onValueChange={setBiometricLogin}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>وضع الحماية القصوى</Text>
            <Text style={styles.settingSubtitle}>تشفير إضافي للبيانات المالية والعقود</Text>
          </View>
          <Switch
            value={highSecurityMode}
            onValueChange={setHighSecurityMode}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
          />
        </View>
      </View>

      {/* قسم الإعدادات العامة والنظام */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>تفضيلات النظام</Text>

        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>إشعارات النظام والعقود</Text>
            <Text style={styles.settingSubtitle}>تنبيهات فورية للمستندات والمالية</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={setNotificationsEnabled}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>الوضع الليلي (Dark Mode)</Text>
            <Text style={styles.settingSubtitle}>تفعيل المظهر الداكن لواجهة التطبيق</Text>
          </View>
          <Switch
            value={darkModeEnabled}
            onValueChange={setDarkModeEnabled}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingTextContainer}>
            <Text style={styles.settingTitle}>المزامنة التلقائية للسحاب</Text>
            <Text style={styles.settingSubtitle}>رفع تقارير الـ PDF والبيانات تلقائياً</Text>
          </View>
          <Switch
            value={autoSync}
            onValueChange={setAutoSync}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
          />
        </View>
      </View>

      {/* قسم إدارة البيانات والصيانة */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>إدارة البيانات والصيانة</Text>

        <TouchableOpacity style={styles.menuButton} onPress={handleBackup}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={22} color={COLORS.primary} />
          <Text style={styles.menuButtonText}>إنشاء نسخة احتياطية فورية</Text>
          <MaterialCommunityIcons name="chevron-left" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={handleClearCache}>
          <MaterialCommunityIcons name="broom" size={22} color={COLORS.primary} />
          <Text style={styles.menuButtonText}>تنظيف الذاكرة المؤقتة (Cache)</Text>
          <MaterialCommunityIcons name="chevron-left" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuButton} onPress={handleLanguageChange}>
          <MaterialCommunityIcons name="translate" size={22} color={COLORS.primary} />
          <Text style={styles.menuButtonText}>لغة التطبيق (العربية)</Text>
          <MaterialCommunityIcons name="chevron-left" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* قسم الدعم وحول التطبيق */}
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>الدعم والمعلومات</Text>

        <TouchableOpacity style={styles.menuButton} onPress={() => Alert.alert('AqarTech B2B', 'الإصدار المطور: 2.1.0\nمخصص لإدارة وتوثيق العقارات والمستندات محلياً وسحابياً.')}>
          <MaterialCommunityIcons name="information-outline" size={22} color={COLORS.primary} />
          <Text style={styles.menuButtonText}>عن التطبيق والإصدار</Text>
          <MaterialCommunityIcons name="chevron-left" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* زر تسجيل الخروج */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <MaterialCommunityIcons name="logout" size={20} color="#E74C3C" style={{ marginLeft: 8 }} />
        <Text style={styles.logoutButtonText}>تسجيل الخروج من الحساب</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: SIZES.padding, backgroundColor: COLORS.background },
  title: { fontSize: SIZES.large, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 20, textAlign: 'right' },
  sectionContainer: { marginBottom: 20 },
  sectionTitle: { fontSize: SIZES.font, fontWeight: 'bold', color: COLORS.textMuted, marginBottom: 10, textAlign: 'right' },
  profileCard: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: SIZES.radius,
    ...SHADOWS.floating,
  },
  avatarBox: { width: 50, height: 50, borderRadius: 25, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  profileInfo: { flex: 1, paddingHorizontal: 15, alignItems: 'flex-end' },
  profileName: { fontSize: SIZES.medium, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 2 },
  profileRole: { fontSize: 12, color: COLORS.textMuted },
  settingItem: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 15,
    borderRadius: SIZES.radius,
    marginBottom: 10,
    ...SHADOWS.floating,
  },
  settingTextContainer: { flex: 1, alignItems: 'flex-end', paddingLeft: 10 },
  settingTitle: { fontSize: SIZES.font, fontWeight: 'bold', color: COLORS.textDark, marginBottom: 2 },
  settingSubtitle: { fontSize: 11, color: COLORS.textMuted },
  menuButton: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    padding: 16,
    borderRadius: SIZES.radius,
    marginBottom: 10,
    ...SHADOWS.floating,
  },
  menuButtonText: { flex: 1, fontSize: SIZES.font, fontWeight: 'bold', color: COLORS.textDark, marginRight: 12, textAlign: 'right' },
  logoutButton: {
    flexDirection: 'row-reverse',
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: '#E74C3C',
    padding: 15,
    borderRadius: SIZES.radius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    ...SHADOWS.floating,
  },
  logoutButtonText: { color: '#E74C3C', fontWeight: 'bold', fontSize: SIZES.medium },
});