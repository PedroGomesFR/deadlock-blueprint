import React from 'react';
import {
  Camera,
  Eye,
  Monitor,
  Radio,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Tv,
  CheckCircle2,
} from 'lucide-react';
import { ElectronSourceInfo } from '../electron';
import { VisionDetectionResult } from '../services/visionScanner';
import { DEADLOCK_LANES, HEROES_DB, LaneColor } from '../data/deadlockData';

interface ScreenScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastCaptureUrl: string | null;
  lastDetection: VisionDetectionResult | null;
  isScanning: boolean;
  autoScanEnabled: boolean;
  onToggleAutoScan: () => void;
  onManualScan: () => void;
  sources: ElectronSourceInfo[];
  selectedSourceId: string;
  onSelectSource: (id: string) => void;
  onRefreshSources: () => void;
  onApplyPresetSimulation: (heroId: string, lane: LaneColor, enemies: string[]) => void;
}

export const ScreenScannerModal: React.FC<ScreenScannerModalProps> = ({
  isOpen,
  onClose,
  lastCaptureUrl,
  lastDetection,
  isScanning,
  autoScanEnabled,
  onToggleAutoScan,
  onManualScan,
  sources,
  selectedSourceId,
  onSelectSource,
  onRefreshSources,
  onApplyPresetSimulation,
}) => {
  if (!isOpen) return null;

  const detectedHero = lastDetection?.detectedHeroId
    ? HEROES_DB.find((h) => h.id === lastDetection.detectedHeroId)
    : null;
  const detectedEnemies = (lastDetection?.detectedEnemyIds || [])
    .map((id) => HEROES_DB.find((h) => h.id === id))
    .filter(Boolean);
  const detectedLane = lastDetection?.detectedLaneColor
    ? DEADLOCK_LANES.find((l) => l.id === lastDetection.detectedLaneColor)
    : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 no-drag">
      <div className="bg-deadlock-panel border border-amber-500/40 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-amber-300 tracking-wide">
                CALIBRATION OCR & CAPTURE D'ÉCRAN DEADLOCK
              </h2>
              <p className="text-xs text-slate-400">
                Analyse locale Tesseract.js + Échantillonnage des couleurs de Zipline (Zéro coût API, 100% privé)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-slate-300 border border-white/10"
          >
            Fermer (Échap)
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Live Screenshot Preview */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Monitor className="w-4 h-4 text-amber-400" /> Aperçu de la capture en direct
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={onManualScan}
                  disabled={isScanning}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-bold text-xs flex items-center gap-1.5 transition"
                >
                  <Camera className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                  {isScanning ? 'Analyse OCR en cours...' : 'Scanner maintenant (Alt+S)'}
                </button>
                <button
                  onClick={onToggleAutoScan}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition ${
                    autoScanEnabled
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-white/5 border-white/15 text-slate-400'
                  }`}
                >
                  <Radio className={`w-3.5 h-3.5 ${autoScanEnabled ? 'animate-pulse text-emerald-400' : ''}`} />
                  Auto-Scan (8s): {autoScanEnabled ? 'ACTIF' : 'OFF'}
                </button>
              </div>
            </div>

            <div className="relative aspect-video rounded-xl overflow-hidden bg-black/70 border border-white/15 flex items-center justify-center">
              {lastCaptureUrl ? (
                <>
                  <img
                    src={lastCaptureUrl}
                    alt="Capture Deadlock"
                    className="w-full h-full object-contain"
                  />
                  {/* HUD Detection Zones Overlay Guide */}
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Top Bar Zone (Heroes & Zipline Color) */}
                    <div className="absolute top-2 left-[15%] right-[15%] h-[12%] border-2 border-dashed border-amber-400/70 bg-amber-500/10 rounded flex items-center justify-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-black/80 text-amber-300 px-2 py-0.5 rounded">
                        Zone HUD Haut : Portraits Ennemis & Couleur Zipline
                      </span>
                    </div>
                    {/* Bottom Right Zone (Abilities & Active Hero) */}
                    <div className="absolute bottom-3 right-4 w-[28%] h-[16%] border-2 border-dashed border-purple-400/70 bg-purple-500/10 rounded flex items-center justify-center">
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-black/80 text-purple-300 px-2 py-0.5 rounded">
                        Zone Compétences : Héros Joué
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 space-y-2">
                  <Tv className="w-10 h-10 text-slate-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-400">Aucune capture effectuée pour le moment</p>
                  <p className="text-xs text-slate-500">
                    Cliquez sur « Scanner maintenant » ou appuyez sur <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-amber-300">Alt+S</kbd> en jeu.
                  </p>
                </div>
              )}
            </div>

            {/* Source Selector */}
            <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  Source vidéo cible (Détecte automatiquement Deadlock.exe si ouvert) :
                </label>
                <button
                  onClick={onRefreshSources}
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Actualiser les fenêtres
                </button>
              </div>
              <select
                value={selectedSourceId}
                onChange={(e) => onSelectSource(e.target.value)}
                className="w-full bg-deadlock-bg border border-white/15 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">🎯 Automatique (Priorité fenêtre Deadlock puis Écran principal)</option>
                {sources.map((src) => (
                  <option key={src.id} value={src.id}>
                    {src.type === 'screen' ? '🖥️ Écran : ' : '🪟 Fenêtre : '}
                    {src.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Right: OCR Diagnostic & Simulation Presets */}
          <div className="lg:col-span-5 space-y-4">
            <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> Résultat du dernier Scan Vision
              </h3>

              {lastDetection ? (
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Source analysée :</span>
                    <span className="font-semibold text-slate-200">{lastDetection.sourceName}</span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Fenêtre Deadlock détectée :</span>
                    <span className={lastDetection.isDeadlockWindow ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                      {lastDetection.isDeadlockWindow ? 'OUI (Deadlock actif)' : 'Écran générique (Jeu non détecté au 1er plan)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Héros détecté :</span>
                    <span className="font-bold text-purple-300">
                      {detectedHero ? detectedHero.name : 'Non modifié (Conservé)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Lane estimée (Zipline) :</span>
                    <span className="font-bold text-amber-300">
                      {detectedLane ? detectedLane.name : 'Conservée'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">Ennemis repérés (OCR) :</span>
                    <span className="font-bold text-red-300">
                      {detectedEnemies.length > 0
                        ? detectedEnemies.map((e) => e?.name).join(' + ')
                        : 'Aucun nom lu (Utilisez TAB en jeu)'}
                    </span>
                  </div>
                  <div className="pt-1">
                    <span className="text-[11px] text-slate-400 block mb-1">
                      Astuce pour une détection OCR à 100% :
                    </span>
                    <p className="text-[11px] text-slate-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 leading-relaxed">
                      Maintenez <strong className="text-amber-300">TAB</strong> (Tableau des scores) en jeu et appuyez sur <strong className="text-amber-300">Alt+S</strong> : les noms des héros sous les portraits en haut de l'écran s'affichent clairement et sont lus instantanément !
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Lancez un scan pour voir les informations extraites de votre écran.
                </p>
              )}
            </div>

            {/* Quick Simulation Scenarios (For testing when Deadlock isn't running) */}
            <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/40 to-deadlock-panel border border-purple-500/30 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-purple-300">
                  Simuler une situation de match (Test Hors-Jeu)
                </h3>
              </div>
              <p className="text-[11px] text-slate-400">
                Deadlock n'est pas lancé ? Testez la réaction du moteur d'auto-build sur ces matchups classiques :
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    onApplyPresetSimulation('vindicta', 'yellow', ['bebop']);
                    onClose();
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-black/50 hover:bg-purple-950/60 border border-white/10 hover:border-purple-400/50 transition flex items-center justify-between text-xs"
                >
                  <div>
                    <strong className="text-purple-300 block">Vindicta en Solo (Jaune) vs Bebop</strong>
                    <span className="text-[10px] text-slate-400">Active l'urgence Anti-Hook (Reactive Barrier + Debuff Remover)</span>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-purple-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    onApplyPresetSimulation('vindicta', 'blue', ['lash', 'abrams']);
                    onClose();
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-black/50 hover:bg-purple-950/60 border border-white/10 hover:border-purple-400/50 transition flex items-center justify-between text-xs"
                >
                  <div>
                    <strong className="text-blue-300 block">Vindicta en Duo (Bleue) vs Lash + Abrams</strong>
                    <span className="text-[10px] text-slate-400">Active l'Anti-Plongeon (Ethereal Shift / Slowing Hex) + Anti-Soin (Healbane)</span>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                </button>

                <button
                  onClick={() => {
                    onApplyPresetSimulation('vindicta', 'purple', ['grey_talon']);
                    onClose();
                  }}
                  className="w-full text-left p-2.5 rounded-lg bg-black/50 hover:bg-purple-950/60 border border-white/10 hover:border-purple-400/50 transition flex items-center justify-between text-xs"
                >
                  <div>
                    <strong className="text-amber-300 block">Duel de Snipers (Violette) : Vindicta vs Grey Talon</strong>
                    <span className="text-[10px] text-slate-400">Active les Boucliers Spirituels (Enchanter's Barrier + Knockdown)</span>
                  </div>
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
