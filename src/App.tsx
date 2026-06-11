/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import GameBoard from './components/GameBoard';
import { ChefHat } from 'lucide-react';

export default function App() {
  return (
    <div 
      className="min-h-screen bg-[#F0F6EB] text-stone-800 flex items-center justify-center p-2 sm:p-4"
      id="app-root-container"
    >
      <main className="w-full max-w-4xl" id="app-main-view">
        <GameBoard />
      </main>
    </div>
  );
}

