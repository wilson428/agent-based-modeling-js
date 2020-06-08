import { quadtree } from 'd3-quadtree';

let Simulation = function() {
	this.agents = [];
	this.places = {};


	// how we'll efficiently track each agent's neighbors
	// https://github.com/d3/d3-quadtree
	this.quadtree = quadtree();

}

let Agent = function(properties) {

	let defaults = {
		x: 0,
		y: 0,
		progress: 0,
		velocity: 1,
		acceleration: 0,
		distance: 6 / PIXELS_PER_FEET,
		place: null,
		status: null,
		element: null
	};

	Object.keys(defaults).forEach(key => {
		if (!this.hasOwnProperty(key)) {
			this[key] = defaults[key];
		}
	});

	this.move = function() {

	};

	console.log(this);
		// progress: Math.random() / 10,
}

let Place = function(id, element, properties) {

	let defaults = {
		type: null,
		distance: 6 / PIXELS_PER_FEET,
		place: null,
		status: null
	};

	Object.keys(defaults).forEach(key => {
		if (!this.hasOwnProperty(key)) {
			this[key] = defaults[key];
		}
	});

	this.element = element;

	console.log(this);
		// progress: Math.random() / 10,
}

function Path(id, element, properties) {
    Place.call(this, id, element, properties);

    this.length = 

    this.placeAgent = function(agent) {

    }

}
