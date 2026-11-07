import React from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';

/**
 * Shared action toolbar (Nov 7, 2026).
 *
 * One row of equal tool buttons, used by Draw and Photo
 * so both screens share the same layout and the same
 * component. The tools differ per screen — Draw: Draw /
 * Erase / Clear / Share; Photo: Send / Share / Add —
 * but the row, sizing, and active/disabled styles are
 * identical, so a button never moves or resizes when
 * the screen changes.
 *
 * Icons are plain text, like the rest of the app: no
 * icon library is used (that would need a native
 * rebuild).
 */
export interface ToolButtonProps {
  label: string;
  icon: string;
  onPress: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  active?: boolean;
  accessibilityLabel?: string;
}

export function ToolButton({
  label,
  icon,
  onPress,
  onLongPress,
  disabled = false,
  active = false,
  accessibilityLabel,
}: ToolButtonProps) {
  return (
    <TouchableOpacity
      style={[
        styles.tool,
        active && styles.toolActive,
        disabled && styles.toolDisabled,
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.toolIcon,
          active && styles.toolTextActive,
          disabled && styles.toolTextDisabled,
        ]}
      >
        {icon}
      </Text>
      <Text
        style={[
          styles.toolLabel,
          active && styles.toolTextActive,
          disabled && styles.toolTextDisabled,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface ActionToolbarProps {
  children: React.ReactNode;
}

export function ActionToolbar({children}: ActionToolbarProps) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'stretch',
    gap: 8,
    width: '100%',
    marginVertical: 8,
  },
  tool: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    backgroundColor: '#eee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolActive: {backgroundColor: '#007aff', borderColor: '#007aff'},
  toolDisabled: {opacity: 0.5},
  toolIcon: {fontSize: 18, lineHeight: 22},
  toolLabel: {fontSize: 13, color: '#333', marginTop: 2, textAlign: 'center'},
  toolTextActive: {color: '#fff', fontWeight: '600'},
  toolTextDisabled: {color: '#666'},
});
