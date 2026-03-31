import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const navItems = [
  { to: '/scenarios', label: 'Scenarios', icon: '☰' },
  { to: '/plans', label: 'Plans', icon: '◫' },
  { to: '/runs', label: 'Runs', icon: '▶' },
  { to: '/defects', label: 'Defects', icon: '⚠' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pf_sidebar') === '1');

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('pf_sidebar', next ? '1' : '0');
  };

  return (
    <div className={`app-layout ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-brand" onClick={toggleSidebar} style={{ cursor: 'pointer' }} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <span className="brand-icon">◆</span>
          {!collapsed && <span className="brand-text">ProofForge</span>}
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <span className="user-avatar">{user?.display_name?.[0]?.toUpperCase()}</span>
            {!collapsed && <span className="user-name">{user?.display_name}</span>}
          </div>
          {!collapsed && (
            <button className="btn-ghost btn-sm" onClick={() => { logout(); navigate('/login'); }}>
              Sign out
            </button>
          )}
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
