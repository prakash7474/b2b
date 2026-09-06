# B2P Mobile — React Native App

A **React Native (Expo + TypeScript)** mobile app for the B2P (Batter-to-Plate) platform.
It is a thin client that talks to the existing **Flask + MongoDB + ML** backend over HTTP.

The whole project is split into clearly named layers so you always know where code lives:

```
mobile/
├── App.tsx                 # Entry point: AuthProvider + NavigationContainer + RootNavigator
├── app.json               # Expo project config
├── package.json           # Dependencies (Expo, React Navigation)
├── babel.config.js
├── tsconfig.json
└── src/
    ├── config.ts          # 🔧 API base URL (point this at your backend)
    ├── api/
    │   └── client.ts      # Typed fetch wrapper: api.get / post / put / delete
    ├── types/
    │   └── index.ts       # All TypeScript types (Vendor, Batch, Order, ...)
    ├── services/          # One file per backend resource (API calls live here)
    │   ├── authService.ts
    │   ├── vendorService.ts
    │   ├── batchService.ts
    │   ├── inventoryService.ts
    │   ├── orderService.ts
    │   ├── alertService.ts
    │   ├── dashboardService.ts
    │   ├── recommendationService.ts
    │   └── predictionService.ts
    ├── context/
    │   └── AuthContext.tsx# Global login state (useAuth())
    ├── hooks/
    │   └── useFetch.ts     # useFetch(fetcher) → { data, loading, error, refetch }
    ├── theme/
    │   └── index.ts        # Central colors & spacing
    ├── utils/
    │   └── helpers.ts      # formatDate, riskColor, freshnessColor
    ├── components/
    │   ├── ui/             # Reusable building blocks
    │   │   ├── Screen.tsx     # Base layout (title bar + scroll + refresh)
    │   │   ├── Button.tsx
    │   │   ├── Input.tsx
    │   │   ├── Badge.tsx
    │   │   ├── StatCard.tsx
    │   │   ├── Loading.tsx
    │   │   └── EmptyState.tsx
    │   └── cards/          # Domain cards (Vendor, Batch, Inventory, Order, Prediction)
    ├── screens/           # One screen per page (Login, Dashboard, Vendors, ...)
    └── navigation/
        ├── types.ts          # RootStackParamList / TabParamList (type-safe routes)
        ├── RootNavigator.tsx # Switches Login ↔ Main based on auth
        └── MainTabs.tsx      # Bottom tab bar (Home, Vendors, Stock, Orders, More)
```

---

## 1. How data flows (the easy mental model)

```
Screen  ──calls──▶  Service  ──HTTP──▶  Flask API (/api/...)
  │                    │
  │                    └─ uses ─▶ api/client.ts  (fetch wrapper)
  └─ renders data from useFetch()
```

- **Screen** = a page (UI only). It never calls `fetch` directly.
- **Service** = knows the endpoint (`vendorService.list()` → `GET /api/vendors`).
- **api/client.ts** = the single place that performs the network request.
- **useFetch** = handles loading / error / refetch so screens stay simple.

---

## 2. Example: fetch and show vendors

`src/services/vendorService.ts`
```ts
import api from '../api/client';
import type { Vendor } from '../types';

const vendorService = {
  list() {
    return api.get<Vendor[]>('/api/vendors');
  },
};
export default vendorService;
```

`src/screens/VendorsScreen.tsx` (simplified)
```tsx
import { useFetch } from '../hooks/useFetch';
import vendorService from '../services/vendorService';
import Screen from '../components/ui/Screen';
import VendorCard from '../components/cards/VendorCard';

export default function VendorsScreen() {
  const { data: vendors, loading, refetch } = useFetch(() => vendorService.list());
  return (
    <Screen title="Vendors" onRefresh={refetch} refreshing={loading}>
      {vendors?.map((v) => <VendorCard key={v.vendor_id} vendor={v} onPress={() => {}} />)}
    </Screen>
  );
}
```

## 3. Example: calling an ML prediction API

```ts
// services/predictionService.ts
predictDemand(data: ManualDemandRequest) {
  return api.post('/api/predict-demand', data);
}
```
```tsx
// screens/DemandForecastScreen.tsx
const res = await predictionService.predictDemand({ vendor_id: 'V100', /* ... */ });
setResult(res); // { predictedDemand, recommendedDispatch, vendorId, productId }
```

---

## 4. Connect to the backend

Open `src/config.ts` and set the backend URL. On a phone/emulator `localhost`
means the device, so use your computer's LAN IP:

```ts
export const API_BASE_URL = 'http://192.168.1.10:5000'; // your machine IP
```

The Flask backend must be running (port 5000) and reachable from the device.

---

## 5. Run the app

```bash
cd mobile
npm install
npx expo start
```

Then press:
- `a` → run on Android emulator/device
- `i` → run on iOS simulator
- scan the QR code with the **Expo Go** app (physical device)

> First run will download dependencies. Use `npx expo start -c` to clear the cache if needed.

---

## 6. Adding a new screen (step by step)

1. Create `src/screens/MyScreen.tsx` using the `<Screen>` wrapper.
2. Add the route name to `src/navigation/types.ts` (`RootStackParamList`).
3. Register it in `src/navigation/RootNavigator.tsx`.
4. (Optional) Link to it from `MoreScreen.tsx` or another screen via
   `navigation.navigate('MyScreen', { id })`.
5. If it needs data, add a method to the matching `src/services/*.ts` file.

---

## 7. Tech stack

| Layer        | Library |
|--------------|---------|
| Runtime      | React Native (Expo) |
| Language     | TypeScript |
| Navigation   | React Navigation (Native Stack + Bottom Tabs) |
| Networking   | Fetch via `src/api/client.ts` |
| Backend      | Flask + MongoDB + Python ML (unchanged) |
