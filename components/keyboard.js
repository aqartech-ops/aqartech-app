import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView } from 'react-native';

// Keeps the field being typed in visible above the on-screen keyboard — everywhere in the app.
//
// Why not KeyboardAvoidingView: on Android (edge-to-edge, the default since Expo SDK 54) the window is
// no longer resized when the keyboard opens, and inside a Modal the behaviour differs again.
// Keyboard events work the same on iOS, Android and inside modals, so we:
//   1. track the keyboard (top edge + height) with useKeyboard();
//   2. give scroll views extra bottom space equal to the keyboard height (KeyboardScrollView);
//   3. when a field gets focus, scroll it into the visible area (useRevealOnFocus, used by Field/MoneyField).
// On the web the browser handles this itself, so everything here is a no-op.

const MARGIN = 24; // space kept between the field and the keyboard
const NATIVE = Platform.OS !== 'web';

/** { height, top } of the keyboard; height = 0 when closed. */
export function useKeyboard() {
  const [state, setState] = useState({ height: 0, top: null });
  useEffect(() => {
    if (!NATIVE) return undefined;
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (e) => {
      const height = e?.endCoordinates?.height ?? 0;
      const top = e?.endCoordinates?.screenY || Dimensions.get('window').height - height;
      setState({ height, top });
    });
    const hide = Keyboard.addListener(hideEvent, () => setState({ height: 0, top: null }));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return state;
}

const RevealContext = createContext(null);

/**
 * A ScrollView that makes room for the keyboard and scrolls the focused field into view.
 * Drop-in replacement for ScrollView (same props).
 */
export function KeyboardScrollView({ children, contentContainerStyle, onScroll, onLayout, keyboardPadding = true, ...props }) {
  const keyboard = useKeyboard();
  const scrollRef = useRef(null);
  const offset = useRef(0);
  const box = useRef(null); // the scroll view's own position in the window
  const pending = useRef(null); // focused field waiting for the keyboard to open

  const measureBox = useCallback(() => {
    scrollRef.current?.measureInWindow?.((x, y, width, height) => {
      box.current = { top: y, bottom: y + height };
    });
  }, []);

  const scrollToShow = useCallback(
    (node, keyboardTop) => {
      if (!node?.measureInWindow || !scrollRef.current) return;
      node.measureInWindow((x, y, width, height) => {
        const visibleTop = (box.current?.top ?? 0) + MARGIN;
        const visibleBottom = Math.min(box.current?.bottom ?? Infinity, keyboardTop ?? Infinity) - MARGIN;
        let delta = 0;
        if (y + height > visibleBottom) delta = y + height - visibleBottom;
        else if (y < visibleTop) delta = y - visibleTop;
        if (Math.abs(delta) > 1) scrollRef.current.scrollTo({ y: Math.max(0, offset.current + delta), animated: true });
      });
    },
    [],
  );

  // Keyboard opened (or changed size): show the field that asked for it.
  useEffect(() => {
    if (!keyboard.height || !pending.current) return undefined;
    measureBox();
    const node = pending.current;
    // wait one frame so the extra bottom space is laid out before scrolling
    const timer = setTimeout(() => scrollToShow(node, keyboard.top), 60);
    return () => clearTimeout(timer);
  }, [keyboard.height, keyboard.top, measureBox, scrollToShow]);

  const reveal = useCallback(
    (node) => {
      pending.current = node;
      if (keyboard.height) {
        measureBox();
        setTimeout(() => scrollToShow(node, keyboard.top), 60);
      }
    },
    [keyboard.height, keyboard.top, measureBox, scrollToShow],
  );

  const value = useMemo(() => (NATIVE ? reveal : null), [reveal]);

  return (
    <RevealContext.Provider value={value}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        {...props}
        onLayout={(e) => {
          measureBox();
          onLayout?.(e);
        }}
        onScroll={(e) => {
          offset.current = e.nativeEvent.contentOffset.y;
          onScroll?.(e);
        }}
        contentContainerStyle={[contentContainerStyle, keyboardPadding && keyboard.height ? { paddingBottom: keyboard.height + MARGIN } : null]}
      >
        {children}
      </ScrollView>
    </RevealContext.Provider>
  );
}

/**
 * For text inputs: returns { ref, onFocus } to spread on the TextInput (keeps any onFocus you pass).
 * Inside a KeyboardScrollView the field is scrolled above the keyboard when focused.
 */
export function useRevealOnFocus(onFocus) {
  const reveal = useContext(RevealContext);
  const ref = useRef(null);
  const handleFocus = useCallback(
    (e) => {
      if (reveal) reveal(ref.current);
      onFocus?.(e);
    },
    [reveal, onFocus],
  );
  return { ref, onFocus: handleFocus };
}
