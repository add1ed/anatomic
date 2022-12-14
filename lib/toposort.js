/*

The MIT License (MIT)

Copyright (c) 2015 Gustavo Henke and Aaron Trent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/

module.exports = class Toposort {
    edges = [];

    Toposort = Toposort;

    /**
     * Adds dependency edges.
     *
     * @since   0.1.0
     * @param   {String} item               An dependent name. Must be an string and not empty
     * @param   {String[]|String} [deps]    An dependency or array of dependencies
     * @returns {Toposort}                  The Toposort instance
     */
    add( item, deps ) {
        if( typeof item !== "string" || !item ) {
            throw new TypeError( "Dependent name must be given as a not empty string" );
        }

        deps = Array.isArray( deps ) ? deps : [deps];

        if( deps.length > 0 ) {
            for( let dep of deps ) {
                if( typeof dep !== "string" || !dep ) {
                    throw new TypeError( "Dependency name must be given as a not empty string" );
                }

                this.edges.push( [item, dep] );
            }

        } else {
            this.edges.push( [item] );
        }

        return this;
    }

    /**
     * Runs the toposorting and return an ordered array of strings
     *
     * @since   0.1.0
     * @returns {String[]}  The list of items topologically sorted.
     */
    sort() {
        let nodes = [];

        //accumulate unique nodes into a large list
        for( let edge of this.edges ) {
            for( let node of edge ) {
                if( nodes.indexOf( node ) === -1 ) {
                    nodes.push( node );
                }
            }
        }

        //initialize the placement of nodes into the sorted array at the end
        let place = nodes.length;

        //initialize the sorted array with the same length as the unique nodes array
        let sorted = new Array( nodes.length );

        //define a visitor function that recursively traverses dependencies.
        var visit = ( node, predecessors ) => {
            //check if a node is dependent of itself
            if( predecessors.length !== 0 && predecessors.indexOf( node ) !== -1 ) {
                throw new Error( `Cyclic dependency found. ${node} is dependent of itself.\nDependency chain: ${predecessors.join( " -> " )} => ${node}` );
            }

            let index = nodes.indexOf( node );

            //if the node still exists, traverse its dependencies
            if( index !== -1 ) {
                let copy = false;

                //mark the node as false to exclude it from future iterations
                nodes[index] = false;

                //loop through all edges and follow dependencies of the current node
                for( let edge of this.edges ) {
                    if( edge[0] === node ) {
                        //lazily create a copy of predecessors with the current node concatenated onto it
                        copy = copy || predecessors.concat( [node] );

                        //recurse to node dependencies
                        visit( edge[1], copy );
                    }
                }

                //add the node to the next place in the sorted array
                sorted[--place] = node;
            }
        };

        for( let i = 0; i < nodes.length; i++ ) {
            let node = nodes[i];

            //ignore nodes that have been excluded
            if( node !== false ) {
                //mark the node as false to exclude it from future iterations
                nodes[i] = false;

                //loop through all edges and follow dependencies of the current node
                for( let edge of this.edges ) {
                    if( edge[0] === node ) {
                        //recurse to node dependencies
                        visit( edge[1], [node] );
                    }
                }

                //add the node to the next place in the sorted array
                sorted[--place] = node;
            }
        }

        return sorted;
    }

    /**
     * Clears edges
     *
     * @since   0.4.0
     * @returns {Toposort}                  The Toposort instance
     */
    clear() {
        this.edges = [];

        return this;
    }
}
