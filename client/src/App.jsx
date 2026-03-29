import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import ScenarioList from './pages/scenarios/ScenarioList.jsx';
import ScenarioDetail from './pages/scenarios/ScenarioDetail.jsx';
import PlanList from './pages/plans/PlanList.jsx';
import PlanDetail from './pages/plans/PlanDetail.jsx';
import RunList from './pages/runs/RunList.jsx';
import RunExecute from './pages/runs/RunExecute.jsx';
import DefectList from './pages/defects/DefectList.jsx';
import DefectDetail from './pages/defects/DefectDetail.jsx';
import Settings from './pages/settings/Settings.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading...</div>;
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Navigate to="/scenarios" />} />
        <Route path="scenarios" element={<ScenarioList />} />
        <Route path="scenarios/:id" element={<ScenarioDetail />} />
        <Route path="plans" element={<PlanList />} />
        <Route path="plans/:id" element={<PlanDetail />} />
        <Route path="runs" element={<RunList />} />
        <Route path="runs/:id" element={<RunExecute />} />
        <Route path="defects" element={<DefectList />} />
        <Route path="defects/:id" element={<DefectDetail />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
