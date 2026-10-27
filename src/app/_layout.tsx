import "../../global.css";
import { Slot } from "expo-router";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "../state/AppProvider";
import { Shell } from "../components/Shell";
import { useTheme } from "../components/ui";
function Layout() {
  const { dark } = useApp();
  const c = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <StatusBar style={dark ? "light" : "dark"} />
      <Shell>
        <Slot />
      </Shell>
    </SafeAreaView>
  );
}
export default function Root() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Layout />
      </AppProvider>
    </SafeAreaProvider>
  );
}
