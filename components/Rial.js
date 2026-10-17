import React from 'react';
import { Image, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLORS, FONT } from '../theme';
import { useI18n } from '../i18n';
import { formatOMR } from '../services/money';

// Official Omani rial symbol (Central Bank of Oman, Nov 2025), traced to a single-colour mask
// so it can be tinted to any colour. Source files: assets/rial-symbol.png / assets/rial-symbol.svg
const SYMBOL = require('../assets/rial-symbol.png');
const RATIO = 303 / 160; // width / height of the artwork

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
