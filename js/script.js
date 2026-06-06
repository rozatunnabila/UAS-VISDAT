// Global State Management
let globalData = [];
let selectedAiTool = null; // Menyimpan filter aktif
let activeTab = "blok1";

// Setup Tooltip
let tooltip = d3.select("#tooltip");
if (tooltip.empty()) {
    tooltip = d3.select("body").append("div")
        .attr("id", "tooltip")
        .style("position", "absolute")
        .style("opacity", 0)
        .style("background", "rgba(15, 23, 42, 0.95)")
        .style("color", "#fff")
        .style("border", "1px solid #334155")
        .style("padding", "10px 14px")
        .style("border-radius", "8px")
        .style("pointer-events", "none")
        .style("font-size", "12px")
        .style("box-shadow", "0 10px 15px -3px rgba(0,0,0,0.3)")
        .style("z-index", "1000");
}

// ==========================================
// LOAD DATA, CLEANING, & FEATURE ENGINEERING
// ==========================================
d3.csv("data/AI_Impact_Student_Life_2026.csv").then(function(rawData) {
    console.log("Data mentah terbaca:", rawData.length, "baris");

    rawData.forEach(d => {
        let age = parseFloat(d.Age);
        let gpaB = parseFloat(d.GPA_Baseline);
        let gpaP = parseFloat(d.GPA_Post_AI);
        let timeS = parseFloat(d.Time_Saved_Hours_Weekly);

        if (d.Primary_AI_Tool && !isNaN(gpaB) && !isNaN(gpaP)) {
            // 1. Parsing Data Asli
            d.Age = age;
            d.GPA_Baseline = gpaB;
            d.GPA_Post_AI = gpaP;
            d.Time_Saved_Hours_Weekly = timeS;
            d.Major = d.Major ? d.Major.trim() : "Lainnya";
            d.Main_Usage_Case = d.Main_Usage_Case ? d.Main_Usage_Case.trim() : "Unknown";
            
            // [SIMULASI] Jika CSV tidak ada kolom Gender & Stress_Level, kita hasilkan deterministik via Student_ID
            let hash = 0;
            if (d.Student_ID) {
                for (let i = 0; i < d.Student_ID.length; i++) hash += d.Student_ID.charCodeAt(i);
            } else { hash = Math.floor(Math.random() * 1000); }
            
            d.Gender = d.Gender ? d.Gender.trim() : (hash % 2 === 0 ? "Laki-laki" : "Perempuan");
            const stressOpts = ["Rendah", "Sedang", "Tinggi"];
            d.Stress_Level = d.Stress_Level ? d.Stress_Level.trim() : stressOpts[hash % 3];

            // 2. FEATURE ENGINEERING
            d.GPA_Change = parseFloat((gpaP - gpaB).toFixed(3)); // Dibulatkan 3 angka di belakang koma
            
            // C. GPA Level
            if (gpaB < 3.0) d.GPA_Level = "Rendah (<3.0)";
            else if (gpaB <= 3.5) d.GPA_Level = "Sedang (3.0-3.5)";
            else d.GPA_Level = "Tinggi (>3.5)";

            // D. Freq Level (Task_Frequency_Daily)
            let freq = parseFloat(d.Task_Frequency_Daily) || 0;
            d.Task_Frequency_Daily = freq;
            if (freq < 2) d.Freq_Level = "Jarang (<2)";
            else if (freq <= 4) d.Freq_Level = "Sedang (2-4)";
            else d.Freq_Level = "Sering (>4)";

            // E. Age Grouping
            if (age <= 20) d.Age_Group = "18-20 Tahun";
            else if (age <= 22) d.Age_Group = "21-22 Tahun";
            else d.Age_Group = ">22 Tahun";

            // F. Time Saved Interval
            if (timeS < 5) d.Time_Saved_Interval = "< 5 Jam";
            else if (timeS <= 10) d.Time_Saved_Interval = "5-10 Jam";
            else d.Time_Saved_Interval = "> 10 Jam";

            // G. Parsing Numerik lainnya
            d.Career_Confidence_Score = parseFloat(d.Career_Confidence_Score) || 0;
            d.AI_Ethics_Concern = d.AI_Ethics_Concern ? d.AI_Ethics_Concern.trim() : "Medium";

            globalData.push(d);
        }
    });

    console.log("Data bersih & Feature Engineering selesai:", globalData.length, "baris");

    // Inisialisasi Dashboard
    // Populate Filter Jurusan
    const majors = Array.from(new Set(globalData.map(d => d.Major))).sort();
    const majorSelect = d3.select("#filter-major");
    majors.forEach(m => majorSelect.append("option").attr("value", m).text(m));

    updateDashboard();

    // Setup Event Listeners untuk Tabs & Sidebar Filters
    d3.selectAll(".tab-btn").on("click", function() {
        const tabId = d3.select(this).attr("data-tab");
        activeTab = tabId;
        d3.selectAll(".tab-btn").classed("active", false);
        d3.select(this).classed("active", true);
        d3.selectAll(".tab-content").classed("active", false);
        d3.select("#" + tabId).classed("active", true);
        updateDashboard(); // Merender ulang grafik agar ukuran sesuai dengan tab yang terbuka
    });

    d3.selectAll("#filter-major, #filter-age, #filter-gender, #filter-stress")
      .on("change", updateDashboard);

    // Event Listener Tombol Reset
    d3.select("#reset-btn").on("click", function() {
        selectedAiTool = null;
        d3.select("#filter-major").property("value", "Semua");
        d3.select("#filter-age").property("value", "Semua");
        d3.select("#filter-gender").property("value", "Semua");
        d3.select("#filter-stress").property("value", "Semua");
        d3.select(this).style("display", "none");
        updateDashboard();
    });

}).catch(error => console.error("Gagal memuat dataset CSV:", error));


// ==========================================
// CORE ENGINE: UPDATE DASHBOARD VIA FILTERS
// ==========================================
function updateDashboard() {
    // 1. Ambil nilai filter sidebar
    const major = d3.select("#filter-major").property("value");
    const ageGroup = d3.select("#filter-age").property("value");
    const gender = d3.select("#filter-gender").property("value");
    const stress = d3.select("#filter-stress").property("value");

    // 2. Terapkan seluruh filter bersarang
    const filteredData = globalData.filter(d => {
        const passAi = selectedAiTool ? d.Primary_AI_Tool === selectedAiTool : true;
        const passMajor = major === "Semua" ? true : d.Major === major;
        const passAge = ageGroup === "Semua" ? true : d.Age_Group === ageGroup;
        const passGender = gender === "Semua" ? true : d.Gender === gender;
        const passStress = stress === "Semua" ? true : d.Stress_Level === stress;
        return passAi && passMajor && passAge && passGender && passStress;
    });

    // 3. Update metrik & UI tombol reset

    const isFiltered = selectedAiTool !== null || major !== "Semua" || ageGroup !== "Semua" || gender !== "Semua" || stress !== "Semua";
    d3.select("#reset-btn").style("display", isFiltered ? "block" : "none").text("Reset Semua Filter");

    updateKPIs(filteredData);

    // 4. Render hanya Task yang berada di Active Tab untuk hindari bug dimensi 0px saat display:none
    const safeRender = (fn, name, dataArgs) => {
        try { fn(dataArgs); } catch (e) { console.error(`Error ${name}:`, e); }
    };

    if (activeTab === "blok1") {
        safeRender(renderTask1, "Task 1", globalData); // Task 1 butuh data utuh sbg base tombol interaktif
        safeRender(renderTask2, "Task 2", filteredData);
        safeRender(renderTask3, "Task 3", filteredData);
    } else if (activeTab === "blok2") {
        safeRender(renderTask4, "Task 4", filteredData);
        safeRender(renderTask5, "Task 5", filteredData);
        safeRender(renderTask6, "Task 6", filteredData);
        safeRender(renderTask7, "Task 7", filteredData);
    } else if (activeTab === "blok3") {
        safeRender(renderTask8, "Task 8", filteredData);
        safeRender(renderTask9, "Task 9", filteredData);
        safeRender(renderTask10, "Task 10", filteredData);
    }
}

function updateKPIs(data) {
    if(data.length === 0) return;
    d3.select("#kpi-total").text(data.length);
    const avgGPA = d3.mean(data, d => d.GPA_Change) || 0;
    d3.select("#kpi-gpa").text((avgGPA >= 0 ? "+" : "") + avgGPA.toFixed(3));
    d3.select("#kpi-time").text(d3.mean(data, d => d.Time_Saved_Hours_Weekly).toFixed(1) + " Jam");
}


// ==========================================
// TASK 1: Stabilitas Dampak IPK per Alat AI (Bar + Error Bar)
// ==========================================
function renderTask1(data) {
    const container = d3.select("#task1 .chart-container");
    container.selectAll("*").remove();
    if (data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const grouped = d3.rollup(data, v => {
        const mean = d3.mean(v, d => d.GPA_Change);
        const deviation = d3.deviation(v, d => d.GPA_Change) || 0;
        return { mean, deviation };
    }, d => d.Primary_AI_Tool);
    
    const chartData = Array.from(grouped, ([tool, val]) => ({tool, mean: val.mean, deviation: val.deviation}))
                           .sort((a,b)=>b.mean - a.mean);

    // UBAH DI SINI: margin.bottom dinaikkan jadi 80 agar ada ruang untuk teks miring
    const margin = {top: 20, right: 40, bottom: 80, left: 60},
          width = document.getElementById("task1").clientWidth - margin.left - margin.right,
          height = 350 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(chartData.map(d => d.tool)).range([0, width]).padding(0.5);
    const y = d3.scaleLinear().domain([0, d3.max(chartData, d => d.mean + d.deviation) * 1.1]).range([height, 0]);

    const colorScale = d3.scaleOrdinal().domain(chartData.map(d=>d.tool))
        .range(["#f43f5e", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#3b82f6"]);

    // UBAH DI SINI: Kemiringan (rotate) ditambah dan digeser agar tidak saling menimpa
    svg.append("g")
       .attr("transform", `translate(0,${height})`)
       .call(d3.axisBottom(x))
       .selectAll("text")
         .style("font-size", "11px")
         .style("font-weight", "bold")
         .attr("transform", "translate(-12, 15) rotate(-35)")
         .style("text-anchor", "end");
         
    svg.append("g").call(d3.axisLeft(y));

    // Draw Error Bars
    svg.selectAll(".error-line")
      .data(chartData).join("line")
        .attr("class", "error-line")
        .attr("x1", d => x(d.tool) + x.bandwidth()/2)
        .attr("x2", d => x(d.tool) + x.bandwidth()/2)
        .attr("y1", d => y(Math.max(0, d.mean - d.deviation)))
        .attr("y2", d => y(d.mean + d.deviation))
        .attr("stroke", "#334155")
        .attr("stroke-width", 1.5)
        .attr("opacity", d => (selectedAiTool === null || selectedAiTool === d.tool) ? 1 : 0.3);

    // Draw Error Bar Caps (Top and Bottom horizontal lines)
    const capWidth = 10;
    
    // Top cap
    svg.selectAll(".error-cap-top")
      .data(chartData).join("line")
        .attr("class", "error-cap-top")
        .attr("x1", d => x(d.tool) + x.bandwidth()/2 - capWidth/2)
        .attr("x2", d => x(d.tool) + x.bandwidth()/2 + capWidth/2)
        .attr("y1", d => y(d.mean + d.deviation))
        .attr("y2", d => y(d.mean + d.deviation))
        .attr("stroke", "#334155")
        .attr("stroke-width", 1.5)
        .attr("opacity", d => (selectedAiTool === null || selectedAiTool === d.tool) ? 1 : 0.3);
        
    // Bottom cap
    svg.selectAll(".error-cap-bottom")
      .data(chartData).join("line")
        .attr("class", "error-cap-bottom")
        .attr("x1", d => x(d.tool) + x.bandwidth()/2 - capWidth/2)
        .attr("x2", d => x(d.tool) + x.bandwidth()/2 + capWidth/2)
        .attr("y1", d => y(Math.max(0, d.mean - d.deviation)))
        .attr("y2", d => y(Math.max(0, d.mean - d.deviation)))
        .attr("stroke", "#334155")
        .attr("stroke-width", 1.5)
        .attr("opacity", d => (selectedAiTool === null || selectedAiTool === d.tool) ? 1 : 0.3);

    // Draw Bars
    svg.selectAll(".bar")
      .data(chartData).join("rect")
        .attr("class", "bar")
        .attr("x", d => x(d.tool))
        .attr("width", x.bandwidth())
        .attr("fill", d => colorScale(d.tool))
        .attr("rx", 4)
        .attr("opacity", d => (selectedAiTool === null || selectedAiTool === d.tool) ? 1 : 0.3)
        .style("cursor", "pointer")
        .attr("y", d => y(d.mean))
        .attr("height", d => height - y(d.mean))
        .on("click", function(event, d) {
            // Jalankan filter saat diklik
            selectedAiTool = (selectedAiTool === d.tool) ? null : d.tool;
            updateDashboard();
        })
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(`<b>${d.tool}</b><br/>Rata-rata IPK Naik: +${d.mean.toFixed(3)}<br/>Standar Deviasi: ±${d.deviation.toFixed(3)}<br/><small><i>Klik untuk filter data</i></small>`);
            d3.select(event.currentTarget).style("stroke", "#0f172a").style("stroke-width", 2);
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", event => {
            tooltip.style("opacity", 0);
            d3.select(event.currentTarget).style("stroke", "none");
        });

    // Legend untuk Error Bar
    const legend = svg.append("g").attr("transform", `translate(${width - 110}, 0)`);
    legend.append("line").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 14).attr("stroke", "#94a3b8").attr("stroke-width", 2);
    legend.append("line").attr("x1", -4).attr("x2", 4).attr("y1", 0).attr("y2", 0).attr("stroke", "#94a3b8").attr("stroke-width", 2);
    legend.append("line").attr("x1", -4).attr("x2", 4).attr("y1", 14).attr("y2", 14).attr("stroke", "#94a3b8").attr("stroke-width", 2);
    legend.append("text").attr("x", 12).attr("y", 11).style("font-size", "11px").style("fill", "#94a3b8").text("Standar Deviasi");

    // Axis Labels
    // UBAH DI SINI: Posisi y diturunkan dari height + 50 menjadi height + 70 agar tidak menabrak label yang miring
    svg.append("text").attr("x", width/2).attr("y", height + 80).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Alat AI");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -45).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Kenaikan IPK");

    // Kesimpulan Dinamis
    const top = chartData[0];
    container.append("div").attr("class", "chart-conclusion").html(top ? `Alat AI dengan rata-rata kenaikan IPK tertinggi adalah <b>${top.tool}</b> (+${top.mean.toFixed(3)}).` : "Tidak ada data.");
}


// ==========================================
// TASK 2: Intensitas Penggunaan AI vs Level IPK
// ==========================================
function renderTask2(data) {
    const container = d3.select("#task2 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const grouped = d3.rollup(data, v => d3.mean(v, d => d.Task_Frequency_Daily), d => d.GPA_Level);
    const chartData = Array.from(grouped, ([level, freq]) => ({level, freq})).sort((a,b) => d3.ascending(a.level, b.level));

    const margin = {top: 20, right: 20, bottom: 40, left: 50},
          width = document.getElementById("task2").clientWidth - margin.left - margin.right,
          height = 300 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(["Rendah (<3.0)", "Sedang (3.0-3.5)", "Tinggi (>3.5)"]).range([0, width]).padding(0.4);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));

    const y = d3.scaleLinear().domain([0, d3.max(chartData, d => d.freq) || 5]).nice().range([height, 0]);
    svg.append("g").call(d3.axisLeft(y).ticks(5));

    svg.selectAll("rect")
      .data(chartData).join("rect")
        .attr("x", d => x(d.level))
        .attr("y", d => y(d.freq))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.freq))
        .style("fill", "#10b981")
        .attr("rx", 4)
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(`<b>IPK: ${d.level}</b><br/>Frekuensi: ${d.freq.toFixed(2)} tugas/hari`);
            d3.select(event.currentTarget).style("fill", "#34d399");
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", event => {
            tooltip.style("opacity", 0);
            d3.select(event.currentTarget).style("fill", "#10b981");
        });

    // Axis Labels
    svg.append("text").attr("x", width/2).attr("y", height + 35).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Level IPK");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -35).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Frekuensi (Tugas/Hari)");

    // Kesimpulan Dinamis
    const top = chartData.reduce((a, b) => a.freq > b.freq ? a : b, {freq: 0});
    container.append("div").attr("class", "chart-conclusion").html(chartData.length ? `Mahasiswa dengan IPK awal <b>${top.level}</b> paling sering menggunakan AI dengan rata-rata <b>${top.freq.toFixed(2)}</b> tugas/hari.` : "Tidak ada data.");
}


// ==========================================
// TASK 3: Heatmap Jurusan vs Penggunaan (Dengan Legend Rentang Warna)
// ==========================================
function renderTask3(data) {
    const container = d3.select("#task3 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    // Kunci grid menggunakan globalData agar layout tidak rusak saat difilter
    const majors = Array.from(new Set(globalData.map(d => d.Major))).sort();
    const usageCases = Array.from(new Set(globalData.map(d => d.Main_Usage_Case))).sort();

    // Hitung data yang sedang difilter
    const heatmapData = d3.rollup(data, v => v.length, d => d.Major, d => d.Main_Usage_Case);
    let flatData = [];
    majors.forEach(m => {
        usageCases.forEach(u => {
            flatData.push({ major: m, usage: u, count: heatmapData.get(m)?.get(u) || 0 });
        });
    });

    // Perbaikan Layout Heatmap (margin.right diperbesar untuk tempat Legend)
    const margin = {top: 20, right: 80, bottom: 90, left: 180},
          containerWidth = document.getElementById("task3").clientWidth || 800,
          width = Math.max(500, containerWidth - margin.left - margin.right),
          height = Math.max(300, majors.length * 28); 

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Skala Sumbu X & Y
    const x = d3.scaleBand().range([0, width]).domain(usageCases).padding(0.05);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x))
       .selectAll("text").attr("transform", "translate(-10,0)rotate(-25)").style("text-anchor", "end").style("font-size", "11px");

    const y = d3.scaleBand().range([height, 0]).domain(majors).padding(0.05);
    svg.append("g").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

    // =================================================================
    // SETUP WARNA: Semakin Pekat Semakin Banyak (Gradasi Biru)
    // =================================================================
    const maxCount = d3.max(flatData, d => d.count) || 1; // Fallback ke 1 agar tidak error jika filter kosong
    const colorScale = d3.scaleSequential()
        .interpolator(d3.interpolateBlues) // Bisa diganti d3.interpolateGreens atau d3.interpolateYlGnBu
        .domain([0, maxCount]);

    // Gambar Kotak Heatmap
    svg.selectAll()
      .data(flatData, d => d.major+':'+d.usage).join("rect")
        .attr("x", d => x(d.usage))
        .attr("y", d => y(d.major))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("rx", 4)
        .style("fill", d => d.count === 0 ? "#f8fafc" : colorScale(d.count))
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(`<b>${d.major}</b><br/>Fokus: ${d.usage}<br/>Jumlah: <b>${d.count}</b> Mahasiswa`);
            d3.select(event.currentTarget).style("stroke", "#0f172a").style("stroke-width", 2);
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", event => {
            tooltip.style("opacity", 0);
            d3.select(event.currentTarget).style("stroke", "none");
        });

    // Tambahkan Teks Angka di dalam kotak (Otomatis kontras warna)
    svg.selectAll()
      .data(flatData).join("text")
        .attr("x", d => x(d.usage) + x.bandwidth()/2)
        .attr("y", d => y(d.major) + y.bandwidth()/2)
        .style("text-anchor", "middle")
        .style("dominant-baseline", "central")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .style("fill", d => d.count > maxCount * 0.5 ? "white" : "#334155") // Putih jika biru pekat, gelap jika biru muda
        .text(d => d.count > 0 ? d.count : "");

    // =================================================================
    // TAMBAHKAN LEGEND RENTANG WARNA (COLORBAR)
    // =================================================================
    const legendWidth = 15;
    const legendHeight = height;
    const legendX = width + 20; // Posisi di sebelah kanan chart

    // 1. Buat Gradien Linear untuk ditaruh di dalam batang Legend
    const defs = svg.append("defs");
    const gradientId = "heatmap-gradient";
    const linearGradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%").attr("y1", "100%") // Dari bawah (0)
        .attr("x2", "0%").attr("y2", "0%");  // Ke atas (Maksimal)

    const numStops = 10;
    for (let i = 0; i <= numStops; i++) {
        const offset = i / numStops;
        linearGradient.append("stop")
            .attr("offset", `${offset * 100}%`)
            .attr("stop-color", colorScale(offset * maxCount));
    }

    // 2. Gambar Batang Legend
    svg.append("rect")
        .attr("x", legendX)
        .attr("y", 0)
        .attr("width", legendWidth)
        .attr("height", legendHeight)
        .style("fill", `url(#${gradientId})`)
        .attr("rx", 2);

    // 3. Tambahkan Skala Angka (Axis) di Samping Legend
    const legendScale = d3.scaleLinear()
        .domain([0, maxCount])
        .range([legendHeight, 0]);

    const legendAxis = d3.axisRight(legendScale).ticks(5);
    svg.append("g")
        .attr("transform", `translate(${legendX + legendWidth}, 0)`)
        .call(legendAxis);
    
    // 4. Tambahkan Label "Jumlah" di atas Legend
    svg.append("text")
        .attr("x", legendX - 5)
        .attr("y", -10)
        .style("font-size", "12px")
        .style("fill", "#94a3b8")
        .style("font-weight", "bold")
        .text("Jumlah");

    // Axis Labels
    svg.append("text").attr("x", width/2).attr("y", height + 70).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Aktivitas Penggunaan");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -160).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Jurusan");

    // Kesimpulan Dinamis
    const top = flatData.reduce((a, b) => a.count > b.count ? a : b, {count: 0});
    container.append("div").attr("class", "chart-conclusion").html(flatData.length && top.count > 0 ? `Penggunaan AI paling dominan adalah fitur <b>${top.usage}</b> pada jurusan <b>${top.major}</b> (<b>${top.count}</b> mahasiswa).` : "Tidak ada interaksi AI spesifik yang dominan pada filter ini.");
}

// ==========================================
// TASK 4: H-Bar Chart (Waktu Hemat vs AI Tool)
// ==========================================
function renderTask4(data) {
    const container = d3.select("#task4 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const grouped = d3.rollup(data, v => d3.mean(v, d => d.Time_Saved_Hours_Weekly), d => d.Primary_AI_Tool);
    const chartData = Array.from(grouped, ([tool, time]) => ({tool, time})).sort((a,b)=> a.time - b.time);

    const margin = {top: 20, right: 30, bottom: 40, left: 100},
          width = document.getElementById("task4").clientWidth - margin.left - margin.right,
          height = 300 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, d3.max(chartData, d => d.time) * 1.1]).range([0, width]);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));

    const y = d3.scaleBand().domain(chartData.map(d=>d.tool)).range([height, 0]).padding(0.3);
    svg.append("g").call(d3.axisLeft(y));

    svg.selectAll("rect")
      .data(chartData).join("rect")
        .attr("y", d => y(d.tool))
        .attr("height", y.bandwidth())
        .attr("x", 0)
        .attr("width", d => x(d.time))
        .attr("fill", "#0ea5e9")
        .attr("rx", 4)
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(`<b>${d.tool}</b><br/>Hemat Waktu: ${d.time.toFixed(1)} Jam/Minggu`);
            d3.select(event.currentTarget).attr("fill", "#38bdf8");
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", event => {
            tooltip.style("opacity", 0);
            d3.select(event.currentTarget).attr("fill", "#0ea5e9");
        });

    // Axis Labels
    svg.append("text").attr("x", width/2).attr("y", height + 35).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Waktu Hemat (Jam/Minggu)");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -85).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Alat AI");

    // Kesimpulan Dinamis
    const top = chartData[chartData.length - 1]; 
    container.append("div").attr("class", "chart-conclusion").html(top ? `Alat AI paling efisien menghemat waktu adalah <b>${top.tool}</b> (<b>${top.time.toFixed(1)}</b> jam/minggu).` : "Tidak ada data.");
}

// ==========================================
// TASK 5: Intensitas vs Waktu Hemat (Bar Chart)
// ==========================================
function renderTask5(data) {
    const container = d3.select("#task5 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const grouped = d3.rollup(data, v => d3.mean(v, d => d.Time_Saved_Hours_Weekly), d => d.Freq_Level);
    const chartData = Array.from(grouped, ([level, time]) => ({level, time})).sort((a,b) => d3.ascending(a.level, b.level));

    const margin = {top: 20, right: 20, bottom: 40, left: 50},
          width = document.getElementById("task5").clientWidth - margin.left - margin.right,
          height = 300 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(["Jarang (<2)", "Sedang (2-4)", "Sering (>4)"]).range([0, width]).padding(0.4);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));

    const y = d3.scaleLinear().domain([0, d3.max(chartData, d => d.time) * 1.2 || 10]).range([height, 0]);
    svg.append("g").call(d3.axisLeft(y).ticks(5));

    svg.selectAll("rect")
      .data(chartData).join("rect")
        .attr("x", d => x(d.level))
        .attr("y", d => y(d.time))
        .attr("width", x.bandwidth())
        .attr("height", d => height - y(d.time))
        .style("fill", "#f59e0b")
        .attr("rx", 4)
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(`<b>${d.level}</b><br/>Rata-rata: ${d.time.toFixed(1)} Jam/Mgg`);
            d3.select(event.currentTarget).style("fill", "#fbbf24");
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", event => {
            tooltip.style("opacity", 0);
            d3.select(event.currentTarget).style("fill", "#f59e0b");
        });

    // Axis Labels
    svg.append("text").attr("x", width/2).attr("y", height + 35).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Tingkat Frekuensi Penggunaan AI");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -35).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Waktu Hemat (Jam/Minggu)");

    // Kesimpulan Dinamis
    const top = chartData.reduce((a, b) => a.time > b.time ? a : b, {time: 0});
    container.append("div").attr("class", "chart-conclusion").html(chartData.length ? `Intensitas penggunaan AI tingkat <b>${top.level}</b> menghasilkan rata-rata penghematan waktu tertinggi (<b>${top.time.toFixed(1)}</b> jam/minggu).` : "Tidak ada data.");
}

// ==========================================
// TASK 6: Efisiensi vs Career Confidence (Line/Point Chart + Error Bars)
// ==========================================
function renderTask6(data) {
    const container = d3.select("#task6 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    // 1. Feature Engineering Khusus: Binning interval waktu sesuai gambar
    const getBin = (time) => {
        if(time <= 4.6) return "(1.987, 4.6]";
        if(time <= 7.2) return "(4.6, 7.2]";
        if(time <= 9.8) return "(7.2, 9.8]";
        if(time <= 12.4) return "(9.8, 12.4]";
        return "(12.4, 15.0]";
    };

    // 2. Agregasi Data: Hitung Rata-rata (Mean) DAN Standar Deviasi (Std)
    const grouped = d3.rollup(data, 
        v => {
            const mean = d3.mean(v, d => d.Career_Confidence_Score);
            const std = d3.deviation(v, d => d.Career_Confidence_Score) || 0; // Standar deviasi untuk error bars
            return { mean, std };
        }, 
        d => getBin(d.Time_Saved_Hours_Weekly)
    );

    // Pastikan urutannya persis seperti di gambar
    const order = ["(1.987, 4.6]", "(4.6, 7.2]", "(7.2, 9.8]", "(9.8, 12.4]", "(12.4, 15.0]"];
    const chartData = order.map(bin => {
        const stats = grouped.get(bin) || {mean: 0, std: 0};
        return { interval: bin, mean: stats.mean, std: stats.std };
    }).filter(d => d.mean > 0); // Buang jika ada interval yang kosong

    // UBAH DI SINI: margin.bottom dinaikkan menjadi 80 agar ada ruang luas di bawah
    const margin = {top: 20, right: 30, bottom: 80, left: 50},
          width = document.getElementById("task6").clientWidth - margin.left - margin.right,
          height = 300 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // Skala X (Interval Waktu)
    const x = d3.scalePoint().domain(order).range([0, width]).padding(0.5);
    
    // UBAH DI SINI: Kemiringan dan posisi label sumbu X digeser agar lebih rapi
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x))
       .selectAll("text")
       .attr("transform", "translate(-12,15)rotate(-25)")
       .style("text-anchor", "end");

    // Skala Y (Skor Karier): Di-zoom in berdasarkan nilai min & max beserta standar deviasinya
    const yMin = d3.min(chartData, d => d.mean - d.std);
    const yMax = d3.max(chartData, d => d.mean + d.std);
    const y = d3.scaleLinear().domain([yMin - 0.2, yMax + 0.2]).range([height, 0]);
    
    svg.append("g").call(d3.axisLeft(y).ticks(6));

    // Warna garis sesuai proposal (Teal / Tosca Gelap)
    const lineColor = "#008080"; 

    // 3. Gambar Error Bars (Garis Vertikal)
    svg.selectAll("line.error")
      .data(chartData).join("line")
        .attr("class", "error")
        .attr("x1", d => x(d.interval))
        .attr("x2", d => x(d.interval))
        .attr("y1", d => y(d.mean + d.std))
        .attr("y2", d => y(d.mean - d.std))
        .attr("stroke", lineColor)
        .attr("stroke-width", 2);

    // 4. Gambar Garis Utama (Line Chart)
    svg.append("path")
       .datum(chartData)
       .attr("fill", "none")
       .attr("stroke", lineColor)
       .attr("stroke-width", 2)
       .attr("d", d3.line().x(d => x(d.interval)).y(d => y(d.mean)));

    // 5. Gambar Titik (Dot Plot)
    svg.selectAll("circle")
      .data(chartData).join("circle")
        .attr("cx", d => x(d.interval))
        .attr("cy", d => y(d.mean))
        .attr("r", 5)
        .attr("fill", lineColor)
        .attr("stroke", "#fff")
        .style("cursor", "pointer")
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(
                `<b>Interval Waktu: ${d.interval}</b><br/>` +
                `Rata-rata Skor: <b>${d.mean.toFixed(2)}</b><br/>` +
                `Batas Atas: ${(d.mean + d.std).toFixed(2)}<br/>` +
                `Batas Bawah: ${(d.mean - d.std).toFixed(2)}`
            );
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", () => tooltip.style("opacity", 0));

    // Legend untuk Line Chart
    const legend = svg.append("g").attr("transform", `translate(${width - 120}, 0)`);
    legend.append("circle").attr("cx", 0).attr("cy", 5).attr("r", 5).attr("fill", lineColor);
    legend.append("text").attr("x", 12).attr("y", 9).style("font-size", "12px").style("fill", "#64748b").text("Rata-rata Skor");
    legend.append("line").attr("x1", 0).attr("x2", 0).attr("y1", 18).attr("y2", 30).attr("stroke", lineColor).attr("stroke-width", 2);
    legend.append("text").attr("x", 12).attr("y", 28).style("font-size", "11px").style("fill", "#94a3b8").text("Standar Deviasi");

    // Axis Labels
    // UBAH DI SINI: Posisi teks "Interval Waktu Hemat" diturunkan menjadi height + 65
    svg.append("text").attr("x", width/2).attr("y", height + 80).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Interval Waktu Hemat");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -35).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Skor Kepercayaan Karier");

    // Kesimpulan Dinamis
    const top = chartData.reduce((a, b) => a.mean > b.mean ? a : b, {mean: 0});
    container.append("div").attr("class", "chart-conclusion").html(chartData.length ? `Tingkat kepercayaan karier rata-rata tertinggi berada pada kelompok waktu hemat <b>${top.interval}</b> dengan skor <b>${top.mean.toFixed(2)}</b>.` : "Tidak ada data.");
}

// ==========================================
// TASK 7: Preferensi AI Berdasarkan Usia (Stacked Bar)
// ==========================================
function renderTask7(data) {
    const container = d3.select("#task7 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const tools = Array.from(new Set(globalData.map(d=>d.Primary_AI_Tool))).sort();
    const ages = ["18-20 Tahun", "21-22 Tahun", ">22 Tahun"];
    
    let stackData = ages.map(age => {
        let obj = { age };
        tools.forEach(t => obj[t] = 0);
        data.filter(d => d.Age_Group === age).forEach(d => obj[d.Primary_AI_Tool]++);
        return obj;
    });

    const margin = {top: 20, right: 120, bottom: 40, left: 50},
          width = document.getElementById("task7").clientWidth - margin.left - margin.right,
          height = 300 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleBand().domain(ages).range([0, width]).padding(0.3);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));

    const yMax = d3.max(stackData, d => d3.sum(tools, t => d[t])) || 10;
    const y = d3.scaleLinear().domain([0, yMax]).nice().range([height, 0]);
    svg.append("g").call(d3.axisLeft(y));

    const colorScale = d3.scaleOrdinal().domain(tools).range(d3.schemeSet2);
    const stacked = d3.stack().keys(tools)(stackData);

    svg.append("g").selectAll("g")
      .data(stacked).join("g")
        .attr("fill", d => colorScale(d.key))
      .selectAll("rect")
      .data(d => d).join("rect")
        .attr("x", d => x(d.data.age))
        .attr("y", d => y(d[1]))
        .attr("height", d => y(d[0]) - y(d[1]))
        .attr("width", x.bandwidth())
        .on("mouseover", function(event, d) {
            const toolName = d3.select(this.parentNode).datum().key;
            const val = d[1] - d[0];
            tooltip.style("opacity", 1).html(`<b>${toolName}</b><br/>Jumlah: ${val}`);
            d3.select(this).style("stroke", "#fff");
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", function() {
            tooltip.style("opacity", 0);
            d3.select(this).style("stroke", "none");
        });

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${width + 10}, 0)`);
    tools.forEach((t, i) => {
        const lg = legend.append("g").attr("transform", `translate(0, ${i * 24})`);
        lg.append("rect").attr("width", 14).attr("height", 14).attr("fill", colorScale(t)).attr("rx", 3);
        lg.append("text").attr("x", 22).attr("y", 12).style("font-size", "12px").style("fill", "#f8fafc").text(t);
    });

    // Axis Labels
    svg.append("text").attr("x", width/2).attr("y", height + 35).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Kelompok Usia");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -35).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Jumlah Mahasiswa");

    // Kesimpulan Dinamis
    const toolCounts = d3.rollup(data, v => v.length, d => d.Primary_AI_Tool);
    const topTool = Array.from(toolCounts).reduce((a,b) => a[1] > b[1] ? a : b, ["", 0]);
    container.append("div").attr("class", "chart-conclusion").html(data.length ? `Alat AI yang paling banyak digunakan dari seleksi ini adalah <b>${topTool[0]}</b> (<b>${topTool[1]}</b> mahasiswa).` : "Tidak ada data.");
}

// ==========================================
// TASK 8: Use Case vs Career Confidence (Lollipop)
// ==========================================
function renderTask8(data) {
    const container = d3.select("#task8 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const grouped = d3.rollup(data, v => d3.mean(v, d => d.Career_Confidence_Score), d => d.Main_Usage_Case);
    const chartData = Array.from(grouped, ([usage, score]) => ({usage, score})).sort((a,b)=> a.score - b.score);

    const margin = {top: 20, right: 30, bottom: 40, left: 150},
          width = document.getElementById("task8").clientWidth - margin.left - margin.right,
          height = 300 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3.scaleLinear().domain([0, 10]).range([0, width]);
    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));

    const y = d3.scaleBand().domain(chartData.map(d=>d.usage)).range([height, 0]).padding(1);
    svg.append("g").call(d3.axisLeft(y));

    svg.selectAll(".lollipop-line")
      .data(chartData).join("line")
        .attr("class", "lollipop-line")
        .attr("x1", x(0))
        .attr("x2", d => x(d.score))
        .attr("y1", d => y(d.usage))
        .attr("y2", d => y(d.usage))
        .attr("stroke", "#94a3b8")
        .attr("stroke-width", 2);

    svg.selectAll("circle")
      .data(chartData).join("circle")
        .attr("cx", d => x(d.score))
        .attr("cy", d => y(d.usage))
        .attr("r", 7)
        .attr("fill", "#f43f5e")
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(`<b>${d.usage}</b><br/>Skor Karir: ${d.score.toFixed(2)}`);
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", () => tooltip.style("opacity", 0));

    // Axis Labels
    svg.append("text").attr("x", width/2).attr("y", height + 35).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Skor Kepercayaan Karier");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -135).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Aktivitas Penggunaan");

    // Kesimpulan Dinamis
    const top = chartData[chartData.length - 1];
    container.append("div").attr("class", "chart-conclusion").html(top ? `Aktivitas AI yang paling mendongkrak kepercayaan karier adalah <b>${top.usage}</b> (Skor: <b>${top.score.toFixed(2)}</b>).` : "Tidak ada data.");
}

// ==========================================
// TASK 9: Tingkat Kekhawatiran Etika (Donut)
// ==========================================
function renderTask9(data) {
    const container = d3.select("#task9 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const grouped = d3.rollup(data, v => v.length, d => d.AI_Ethics_Concern);
    const chartData = Array.from(grouped, ([concern, count]) => ({concern, count}));

    const width = document.getElementById("task9").clientWidth,
          height = 300,
          radius = Math.min(width - 150, height) / 2 - 20; // Radius disesuaikan untuk ruang legend

    const svg = container.append("svg")
        .attr("width", width)
        .attr("height", height)
      .append("g")
        .attr("transform", `translate(${width/2 - 60},${height/2})`);

    const color = d3.scaleOrdinal().domain(["Low", "Medium", "High"]).range(["#34d399", "#facc15", "#ef4444"]);
    
    const pie = d3.pie().value(d => d.count);
    const arc = d3.arc().innerRadius(radius * 0.5).outerRadius(radius);

    svg.selectAll("path")
      .data(pie(chartData)).join("path")
        .attr("d", arc)
        .attr("fill", d => color(d.data.concern))
        .attr("stroke", "#1e293b")
        .style("stroke-width", "2px")
        .on("mouseover", (event, d) => {
            const pct = (d.data.count / data.length * 100).toFixed(1);
            tooltip.style("opacity", 1).html(`<b>${d.data.concern} Concern</b><br/>${d.data.count} Mahasiswa (${pct}%)`);
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", () => tooltip.style("opacity", 0));

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${radius + 40}, ${-radius + 20})`);
    chartData.forEach((d, i) => {
        const lg = legend.append("g").attr("transform", `translate(0, ${i * 26})`);
        lg.append("rect").attr("width", 14).attr("height", 14).attr("fill", color(d.concern)).attr("rx", 3);
        lg.append("text").attr("x", 22).attr("y", 12).style("font-size", "12px").style("fill", "#f8fafc").style("font-weight", "500").text(`${d.concern} Concern`);
    });

    // Kesimpulan Dinamis
    const top = chartData.reduce((a,b)=>a.count>b.count?a:b, {count:0});
    container.append("div").attr("class", "chart-conclusion").html(chartData.length ? `Mayoritas mahasiswa memiliki tingkat kekhawatiran etika <b>${top.concern}</b> (<b>${top.count}</b> mahasiswa).` : "Tidak ada data.");
}

// ==========================================
// TASK 10: Scatter Plot + Quadrant (Time vs GPA)
// ==========================================
function renderTask10(data) {
    const container = d3.select("#task10 .chart-container");
    container.selectAll("*").remove();
    if(data.length === 0) {
        container.append("div").attr("class", "chart-conclusion").html("Tidak ada data yang sesuai dengan filter.");
        return;
    }

    const margin = {top: 20, right: 30, bottom: 50, left: 60},
          width = document.getElementById("task10").clientWidth - margin.left - margin.right,
          height = 400 - margin.top - margin.bottom;

    const svg = container.append("svg")
        .attr("width", width + margin.left + margin.right)
        .attr("height", height + margin.top + margin.bottom)
      .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const xMax = d3.max(data, d => d.Time_Saved_Hours_Weekly) || 15;
    const yMax = d3.max(data, d => d.GPA_Change) || 1;
    const yMin = d3.min(data, d => d.GPA_Change) || -0.5;

    const x = d3.scaleLinear().domain([0, xMax]).range([0, width]);
    const y = d3.scaleLinear().domain([Math.min(0, yMin), Math.max(0, yMax)]).nice().range([height, 0]);

    // Grid regresi kuadran
    const meanX = d3.mean(data, d => d.Time_Saved_Hours_Weekly);
    const meanY = d3.mean(data, d => d.GPA_Change);

    svg.append("g").attr("transform", `translate(0,${height})`).call(d3.axisBottom(x));
    svg.append("g").call(d3.axisLeft(y));
    
    // Axis labels
    svg.append("text").attr("x", width/2).attr("y", height + 40).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Waktu Terhemat (Jam/Minggu)");
    svg.append("text").attr("transform", "rotate(-90)").attr("y", -40).attr("x", -height/2).style("text-anchor", "middle").style("fill", "#94a3b8").style("font-size", "12px").text("Peningkatan IPK");

    // Garis Rata-rata
    svg.append("line").attr("class", "quadrant-line").attr("x1", x(meanX)).attr("x2", x(meanX)).attr("y1", 0).attr("y2", height);
    svg.append("line").attr("class", "quadrant-line").attr("x1", 0).attr("x2", width).attr("y1", y(meanY)).attr("y2", y(meanY));

    // Legend Dalam Chart
    const legend = svg.append("g").attr("transform", `translate(${width - 130}, ${height - 65})`);
    // Background untuk Legend agar tidak bertabrakan dengan garis/titik scatter plot
    legend.append("rect").attr("x", -15).attr("y", -15).attr("width", 125).attr("height", 55).attr("fill", "rgba(30, 41, 59, 0.9)").attr("rx", 6).attr("stroke", "#334155");
    legend.append("circle").attr("cx", 0).attr("cy", 0).attr("r", 6).attr("fill", "#34d399");
    legend.append("text").attr("x", 14).attr("y", 4).style("font-size", "13px").style("font-weight", "bold").style("fill", "#34d399").text("Power User");
    legend.append("circle").attr("cx", 0).attr("cy", 24).attr("r", 6).attr("fill", "#3b82f6");
    legend.append("text").attr("x", 14).attr("y", 28).style("font-size", "13px").style("font-weight", "bold").style("fill", "#3b82f6").text("Normal User");

    // Teks Bantuan Quadrant Kanan Atas
    svg.append("text").attr("x", width).attr("y", 20).attr("text-anchor", "end").style("fill", "#34d399").style("font-weight", "bold").style("font-size", "14px").text("Power Users Quadrant");

    svg.selectAll("circle")
      .data(data).join("circle")
        .attr("cx", d => x(d.Time_Saved_Hours_Weekly))
        .attr("cy", d => y(d.GPA_Change))
        .attr("r", 4)
        .attr("fill", d => (d.Time_Saved_Hours_Weekly >= meanX && d.GPA_Change >= meanY) ? "#34d399" : "#3b82f6")
        .attr("opacity", 0.6)
        .on("mouseover", (event, d) => {
            tooltip.style("opacity", 1).html(`<b>Power User?</b> ${d.Time_Saved_Hours_Weekly >= meanX && d.GPA_Change >= meanY ? 'Ya' : 'Tidak'}<br/>Hemat: ${d.Time_Saved_Hours_Weekly} Jam<br/>IPK Naik: ${d.GPA_Change}`);
        })
        .on("mousemove", event => tooltip.style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 20) + "px"))
        .on("mouseleave", () => tooltip.style("opacity", 0));

    // Kesimpulan Dinamis
    const powerUsers = data.filter(d => d.Time_Saved_Hours_Weekly >= meanX && d.GPA_Change >= meanY).length;
    container.append("div").attr("class", "chart-conclusion").html(data.length ? `Terdapat <b>${powerUsers}</b> Power Users yang berhasil mengoptimalkan efisiensi waktu sekaligus meraih peningkatan IPK di atas rata-rata.` : "Tidak ada data.");
}