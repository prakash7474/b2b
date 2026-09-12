import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView } from 'react-native';
import { colors, radius, typography, spacing } from '../theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[B2P ERROR BOUNDARY]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.container}>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.headerSub}>B2P SYSTEM ALERT</Text>
                <Text style={styles.headerTitle}>Ledger Rendering Interrupted</Text>
              </View>

              <View style={styles.body}>
                <Text style={styles.message}>
                  An unexpected UI exception occurred while rendering this screen. The application prevented a total crash.
                </Text>

                {this.state.error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorLabel}>Diagnostic Exception:</Text>
                    <Text style={styles.errorText}>
                      {this.state.error.name}: {this.state.error.message}
                    </Text>
                  </View>
                )}

                <TouchableOpacity style={styles.resetBtn} onPress={this.handleReset} activeOpacity={0.8}>
                  <Text style={styles.resetBtnText}>↺ Reload Current Screen</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.batterCream,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 540,
    backgroundColor: colors.paperWhite,
    borderWidth: 1.5,
    borderTopWidth: 3,
    borderColor: colors.rustRed,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  header: {
    backgroundColor: colors.dangerBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  headerSub: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.rustRed,
    fontFamily: typography.mono,
    letterSpacing: 0.8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.inkCharcoal,
    fontFamily: typography.heading,
  },
  body: {
    padding: spacing.md,
  },
  message: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  errorBox: {
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  errorLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
    fontFamily: typography.mono,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: colors.rustRed,
    fontFamily: typography.mono,
  },
  resetBtn: {
    backgroundColor: colors.clayTerracotta,
    borderWidth: 1.5,
    borderColor: colors.inkCharcoal,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  resetBtnText: {
    color: colors.paperWhite,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
