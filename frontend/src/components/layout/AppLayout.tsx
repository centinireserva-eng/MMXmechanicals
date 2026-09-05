import { ReactNode } from 'react';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
export default function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-mmx-bg text-mmx-text">
      <Sidebar />
      <div className="min-h-screen lg:ml-[224px] flex flex-col relative z-10">
        <TopBar />
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
