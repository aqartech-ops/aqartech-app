import { Dimensions } from 'react-native';
const { width, height } = Dimensions.get('window');

// الألوان المستوحاة من التصميم الفاتح الأنيق (البيج والبرونزي)
export const COLORS = {
  background: '#F5EFE6',   // بيج فاتح يعطي طابعاً مريحاً وأنيقاً
  card: '#FFFFFF',         // أبيض نقي للبطاقات وصناديق الإدخال
  primary: '#B68D6A',      // برونزي / ذهبي مطفي للأزرار (مثل زر الحفظ)
  secondary: '#B68D6A',    // برونزي للعناوين البارزة
  textDark: '#3E3228',     // بني داكن للنصوص الأساسية (للقراءة بوضوح)
  textMuted: '#96897F',    // رمادي-بني للنصوص الفرعية (مثل الـ Placeholder)
  border: '#D8CFC4',       // لون الحدود الفاتح للصناديق
  
  // ألوان التبويبات العلوية
  tabActiveBg: '#D5E6F5',  // أزرق فاتح للتبويب النشط
  tabActiveText: '#2B6CB0',// أزرق غامق لنص التبويب النشط
};

// المقاسات المعدلة للحواف الدائرية
export const SIZES = {
  base: 10,
  small: 13,
  font: 15,
  medium: 17,
  large: 22,
  radius: 25, // زوايا دائرية كبيرة جداً (Pill-shape) مثل الصورة
  padding: 20,
};

// الظلال الناعمة
export const SHADOWS = {
  floating: {
    shadowColor: '#B68D6A', // ظل خفيف متناسق مع اللون البرونزي
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  }
};

export const SCREEN = { width, height };

export default { COLORS, SIZES, SHADOWS, SCREEN };