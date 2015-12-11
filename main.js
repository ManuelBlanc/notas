(function() { "use strict";

// Analyze a list of grades using jStat
function analyze_grades(grades) {
	var info = {};

	var jsg = jStat(grades);
	info.grades = grades;

	// Basic descriptive statistics
	info.n        	= grades.length;
	info.min      	= jsg.min();
	info.max      	= jsg.max();
	info.mean     	= jsg.mean();
	info.median   	= jsg.median();
	info.quartiles	= jsg.quartiles();
	info.iqr      	= info.quartiles[2] - info.quartiles[0];
	info.variance 	= jsg.variance();
	info.stdev    	= jsg.stdev();

	info.quartiles[1] = info.median;

	// Is the mean above 5.0?
	// H_0 : \mu > 5 (mean < \mu_0 * t_{n-1; alpha} * s / sqrt(n))
	var alpha = 0.05;
	info.h0_rechazo = 5 - jStat.studentt.inv(alpha, info.n-1) * (info.stdev / Math.sqrt(info.n));
	info.h0 = info.mean < info.h0_rechazo;

	info.histogram = d3.range(21).map(function(i) { return { bucket: i/2, freq: 0 }; });
	grades.forEach(function(g) { info.histogram[Math.floor(2*g+0.5)].freq++; });

	info.gaussian = d3.range(-0.25, 10.5, 0.25)
		.map(function(x) {
			return [x, info.n/info.stdev*jStat.normal.pdf(x, info.mean, info.stdev)];
		});

		console.log(info.gaussian);

	return info;
}

// Populate the grade table
function populate_table(grades, info) {
	var ul = d3.select("#list-grades").select("ul");

	var grade_formatter = d3.format(".1f");

	ul.selectAll("li").remove();
	var li = ul.selectAll("li").data(grades);
	li.enter()
		.insert("li", ":first-child")
		.attr("class", "list-group-item text-center");

	li.text(grade_formatter);

	d3.select("#table-stats table").selectAll(".data")
		.datum(function() { return this.dataset; })
		.text(function(d) { return " " + d3.format(d.fmt)(info[d.info]); });
}


function tweenOpacity(from, to, duration) {
	return function(selection) {
		selection.style("opacity", from)
			.transition("tweenOpacity")
			.duration(duration || 1000)
			.style("opacity", to);
	};
}

// Inicializacion de la grafica
//----------------------------------------------------------------
function BarChart(svg) {

	var margin = this.margin = {top: 20, right: 20, bottom: 30, left: 40};
	var width  = this.width = $(svg).parent().width() - this.margin.right - this.margin.left;
	var height = this.height = 400;

	this.svg = d3.select(svg)
		.attr("width",  width + margin.right + margin.left)
		.attr("height", height + margin.top + margin.bottom + 100);

	var chart = this.chart = this.svg.append("g")
		.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

	// Escalas
	this.scale = {
		x: d3.scale.ordinal()
			.domain(d3.range(0, 10.5, 0.5))
			.rangeRoundBands([0, width], 0.05),
		y: d3.scale.linear()
			.domain([0, 10]) // Dominio temporal. El real se calcula con los datos despues
			.range([height, 0]),
	};

	var y = this.scale.y;

	// Controladores de los ejes
	this.axis = {
		x: d3.svg.axis().scale(this.scale.x).orient("bottom").tickFormat(d3.format(".1f")),
		y: d3.svg.axis().scale(this.scale.y).orient("left"),
	};

	// La cuadricula
	this.grid = chart.append('g').attr('class', 'grid');

	// Las barras (debe ir ANTES que los ejes)
	chart.append("g").attr("class", "bars");

	// La gausiana (despues de las barras, antes de los EJES)
	chart.append("g").attr("class", "bestfit").append("path");

	// Candlestick
	var boxG = chart.append("g").attr("class", "boxplot")
		.attr("transform", "translate(0, " + (height+50) + ")");
	boxG.append("rect").attr("class", "box");
	boxG.append("line").attr("class", "median");
	boxG.append("line").attr("class", "whisker left");
	boxG.append("line").attr("class", "whisker right");
	boxG.append("line").attr("class", "whisker-end left");
	boxG.append("line").attr("class", "whisker-end right");


	// Los ejes en si
	chart.append("g")
		.attr("class", "x axis")
		.call(this.axis.x)
		.attr("transform", "translate(0," + height + ")");

	chart.append("g")
		.attr("class", "y axis")
		.call(this.axis.y)
		.append("text")
			.attr("transform", "rotate(-90)")
			.attr("y", 6)
			.attr("dy", ".71em")
			.style("text-anchor", "end")
			.text("Frecuencia");

	chart.select(".x.axis").call(tweenOpacity(0, 1, 500));
	chart.select(".y.axis").call(tweenOpacity(0, 1, 500));
}

BarChart.prototype.domain = function(max) {
	var y = this.scale.y;

	y.domain([0, max]);
	this.chart.select('.y.axis').transition().duration(1000).call(this.axis.y);

	var gridLines = this.grid.selectAll('line').data(d3.range(1+Math.floor(max*0.5)));
	gridLines.enter().append('line').attr({
		x1: 0,
		x2: this.width,
		y1: 0,
		y2: 0,
	}).call(tweenOpacity(0, 0.2));
	gridLines.exit().call(tweenOpacity(0.2, 0)).remove();
	gridLines.transition().duration(1000).attr({
		x1: 0,
		x2: this.width,
		y1: function(d) { return y(2*d); },
		y2: function(d) { return y(2*d); },
	});
};

BarChart.prototype.box = function(info) {
	var x = d3.scale.linear().domain([-0.25, 10.25]).range([0, this.width]);

	var quartiles = info.quartiles;
	var whisker_left  = Math.max(info.min, quartiles[0] - 1.5*info.iqr); // jStat.percentile(info.grades, 0.10);
	var whisker_right = Math.min(info.max, quartiles[2] + 1.5*info.iqr); // jStat.percentile(info.grades, 0.90);

	this.chart.select("rect.box").transition().duration(1000)
		.attr({
			x: x(quartiles[0]),
			y: 0,
			width: x(quartiles[2] - quartiles[0] - 0.25),
			height: 50,
		});
	this.chart.select("line.median").transition().duration(1000)
		.attr({
			x1: x(quartiles[1]),
			y1: 0,
			x2: x(quartiles[1]),
			y2: 50,
		});
	this.chart.select("line.whisker.left").transition().duration(1000)
		.attr({
			x1: x(whisker_left),
			y1: 25,
			x2: x(quartiles[0]),
			y2: 25,
		});
	this.chart.select("line.whisker-end.left").transition().duration(1000)
		.attr({
			x1: x(whisker_left),
			y1: 12.5,
			x2: x(whisker_left),
			y2: 37.5,
		});
	this.chart.select("line.whisker.right").transition().duration(1000)
		.attr({
			x1: x(whisker_right),
			y1: 25,
			x2: x(quartiles[2]),
			y2: 25,
		});
	this.chart.select("line.whisker-end.right").transition().duration(1000)
		.attr({
			x1: x(whisker_right),
			y1: 12.5,
			x2: x(whisker_right),
			y2: 37.5,
		});
};

BarChart.prototype.line = function(lineData) {

	var width = this.width, height = this.height;

	var x = d3.scale.linear().domain([-0.25, 10.25]).range([0, width]);
	var y = this.scale.y;

	var line = d3.svg.line()
		.x(function(d) { return x(d[0]); })
		.y(function(d) { return y(d[1]); });

	this.chart.select(".bestfit").select("path").datum(lineData).attr("d", line);
};

BarChart.prototype.bars = function(barData) {

	var width = this.width, height = this.height;
	var x = this.scale.x, y = this.scale.y;

	var bar = this.chart.select(".bars").selectAll(".bar").data(barData);
	bar.exit().remove();
	bar.enter().append("rect").attr("class", "bar");
	bar
		.attr("x", function(d) { return x(d.bucket); })
		.attr("width", x.rangeBand())
		.attr("y", height)
		.attr("height", 0)
		.transition()
			.duration(1000)
			.attr("y", function(d) { return y(d.freq); })
			.attr("height", function(d) { return height - y(d.freq); });
};

$(".uploader input:text").focus(function() {
	$(".uploader input:file").click();
});


function read_file(file) {
	return new Promise(function(resolve, reject) {
		var reader = new FileReader();
		reader.onload = function(e) { resolve(e.target.result); };
		reader.onerror = function() { reject(e.target.error); };
		reader.readAsText(file);
	});
}

// Timeout para evitar condicion de carrera (TODO: investigar esto)
setTimeout(function() {
$(function() {

	var graph = new BarChart($("svg")[0]);

	$(".uploader input:file").change(function(evt) {

		var file = evt.target.files[0];
		$(".uploader input:text").val(
			file.name + " (" + file.type + ")"
		);

		read_file(file).then(function(text) {
			var gradeDict;
			switch (file.type) {
				case "text/csv":
					gradeDict = d3.csv.parse(text);
					break;

				case "text/tab-separated-values":
					gradeDict = d3.tsv.parse(text);
					break;

				default:
					throw new Error("Unrecognized type " + file.type);
			}

			var grades = gradeDict.map(function(d) { return parseFloat(d.nota); }).sort(d3.ascending);
			var info = analyze_grades(grades);

			populate_table(grades, info);

			graph.domain(d3.max(info.histogram, function(d) { return d.freq; }));
			graph.bars(info.histogram);
			graph.line(info.gaussian);
			graph.box(info);

		});
	});

});
}, 200);



// // Debugeando
// d3.tsv("/notas1.tsv", function(error, data) {
//	var grades = data.map(function(d) { return +d.nota; }).sort(d3.ascending);
//	var info = analyze_grades(grades);

//	$(function() {
//		populate_table(grades);


//		graph.domain(d3.max(info.histogram));
//		graph.bars(info.histogram);
//		graph.line(info.gaussian);

//	});
// });

})(); // use strict