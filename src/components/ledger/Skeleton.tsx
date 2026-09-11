import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { colors, radius } from '../../theme';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 18,
  style,
}) => {
  return (
    <View
      style={[
        styles.skeleton,
        { width: width as any, height },
        style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.borderHairline,
    borderRadius: radius.sm,
    opacity: 0.8,
  },
});
