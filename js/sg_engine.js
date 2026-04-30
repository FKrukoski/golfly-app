/**
 * Strokes Gained Engine
 * Lógica para importar JSON e calcular o ganho por tacada.
 */
window.SGEngine = (function() {
    let benchmarks = null;

    async function init() {
        try {
            const response = await fetch('data/sg_benchmarks.json');
            const data = await response.json();
            benchmarks = data.benchmark_data;
            console.log("SG Benchmarks loaded.");
        } catch (e) {
            console.warn("SG Benchmarks fail to load (this is expected if not deployed correctly).", e);
        }
    }

    function interpolateValue(lieData, dist) {
        if (!lieData || lieData.length === 0) return 0;
        
        // Find exact or closest bounds
        let lower = lieData[0];
        let upper = lieData[lieData.length - 1];

        if (dist <= lower.dist_yards) return lower.avg_strokes_to_hole;
        if (dist >= upper.dist_yards) return upper.avg_strokes_to_hole;

        for (let i = 0; i < lieData.length - 1; i++) {
            if (dist >= lieData[i].dist_yards && dist <= lieData[i+1].dist_yards) {
                lower = lieData[i];
                upper = lieData[i+1];
                break;
            }
        }

        // Linear interpolation
        const range = upper.dist_yards - lower.dist_yards;
        if (range === 0) return lower.avg_strokes_to_hole;
        const distFraction = (dist - lower.dist_yards) / range;
        
        const avgRange = upper.avg_strokes_to_hole - lower.avg_strokes_to_hole;
        return lower.avg_strokes_to_hole + (distFraction * avgRange);
    }

    function getBenchmark(hcp, lie, dist) {
        if (!benchmarks) return 0;
        const hcpData = benchmarks[`handicap_${hcp}`] || benchmarks['scratch']; // fallback
        if (!hcpData) return 0;
        
        let lieData = hcpData[lie];
        if (!lieData) return 0; // Se não tem lie específico, retorna 0 (erro de dados)

        return interpolateValue(lieData, dist);
    }

    /**
     * SG = Benchmark(Start) - Benchmark(End) - 1
     */
    function calculateSG(startDist, startLie, endDist, endLie, hcp = 0) {
        // Se a bola entrou no buraco (End), End = 0 strokes
        const benchStart = getBenchmark(hcp, startLie, startDist);
        const benchEnd = endDist === 0 ? 0 : getBenchmark(hcp, endLie, endDist);
        
        const sg = benchStart - benchEnd - 1;
        return parseFloat(sg.toFixed(3));
    }

    /**
     * Categorias oficiais:
     * Off-the-tee: Tacadas iniciais em Par 4/5
     * Approach: Tacadas fora do Green e > 30 yards
     * Around-the-green: Tacadas fora do Green e <= 30 yards
     * Putting: Tacadas no Green
     */
    function categorizeShot(dist, lie, isTeeShot, par) {
        if (lie === 'green') return 'putting';
        if (isTeeShot && par > 3) return 'off_the_tee';
        if (dist <= 30) return 'around_the_green';
        return 'approach';
    }

    return {
        init,
        getBenchmark,
        calculateSG,
        categorizeShot
    };
})();
