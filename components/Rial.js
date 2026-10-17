import React from 'react';
import { Image, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT } from '../theme';
import { useI18n } from '../i18n';
import { formatOMR } from '../services/money';

// Official Omani rial symbol (Central Bank of Oman, Nov 2025), converted from the official artwork to a single-colour mask
// so it can be tinted to any colour. Source files: assets/rial-symbol.png / assets/rial-symbol.svg
const SYMBOL = require('../assets/rial-symbol.png');
const RATIO = 960 / 500; // width / height of the official artwork

/** The rial symbol at a given height. */
export function RialSymbol({ size = 16, color = COLORS.textDark, style }) {
  return (
    <Image
      source={SYMBOL}
      accessibilityLabel="OMR"
      resizeMode="contain"
      style={[{ height: size, width: size * RATIO, tintColor: color }, style]}
    />
  );
}

/**
 * An amount in OMR: the symbol, then the number with 3 decimals (baisa).
 * Visually the symbol sits on the left in both languages
 * (English reads "⃁ 1,250.500"; Arabic reads the number first, then the currency).
 */
export function Money({ baisa, size = FONT.body, color = COLORS.textDark, weight, style }) {
  const { lang } = useI18n();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: Math.max(3, size * 0.25) }, style]}>
      <RialSymbol size={size * 0.72} color={color} />
      <Text style={{ fontSize: size, color, fontWeight: weight ? FONT[weight] ?? weight : undefined, fontVariant: ['tabular-nums'] }}>
        {formatOMR(baisa, lang, { withCurrency: false })}
      </Text>
    </View>
  );
}

/**
 * Icon for sections and buttons. Use the name "rial" for the rial symbol (Financials);
 * any other name is a MaterialCommunityIcons icon.
 */
export function SectionIcon({ name, size = 22, color = COLORS.textDark }) {
  if (name === 'rial') {
    // Keep it inside a square box the size of a normal icon so layouts line up
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <RialSymbol size={size * 0.5} color={color} />
      </View>
    );
  }
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

/**
 * Money input: the user types OMR ("1250.5"), the form keeps the text; convert with parseOMR()
 * to integer baisa when saving. The rial symbol sits inside the field.
 */
export function MoneyField({ label, value, onChangeText, error, hint }) {
  const { row, align } = useI18n();
  const small = (extra) => [{ fontSize: FONT.small, textAlign: align, color: COLORS.textDark }, extra];
  return (
    <View style={{ gap: 4 }}>
      {label ? <Text style={small({ fontWeight: FONT.weightMedium })}>{label}</Text> : null}
      <View
        style={{
          flexDirection: row,
          alignItems: 'center',
          gap: 8,
          backgroundColor: COLORS.surface,
          borderWidth: 1,
          borderColor: error ? COLORS.danger : COLORS.borderStrong,
          borderRadius: 12,
          paddingHorizontal: 12,
          minHeight: 46,
        }}
      >
        <RialSymbol size={13} color={COLORS.textMuted} />
        <TextInput
          value={value}
          onChangeText={(t) => onChangeText(t.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫]/g, '.').replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          inputMode="decimal"
          placeholder="0.000"
          placeholderTextColor={COLORS.textMuted}
          style={{ flex: 1, fontSize: FONT.body, color: COLORS.textDark, paddingVertical: 8, textAlign: align, outlineStyle: 'none' }}
        />
      </View>
      {error ? <Text style={small({ color: COLORS.danger })}>{error}</Text> : hint ? <Text style={small({ color: COLORS.textMuted })}>{hint}</Text> : null}
    </View>
  );
}
