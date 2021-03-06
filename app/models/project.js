import Ember from 'ember';
import Struct from './struct';
import {DataStruct} from './data';
import GraphLayout from './graph-layout';
import GraphLayer from './graph-layer';
import GeoDef from './geo-def';
/* global Em */

const CURRENT_VERSION = 3.0;

let Project = Struct.extend({

    version: CURRENT_VERSION,
    date: new Date(),
    thumbnail: null,
  
    data: null,
    
    graphLayout: null,
    
    graphLayers: null,

    labellingLayers: null,
    
    geoDef: null,
    
    title: "",
    dataSource: null,
    author: null,
    comment: null,

    report: null,

    blindnessMode: null,

    hasLabelling: function() {
      return this.get('labellingLayers') && this.get('labellingLayers').length > 0
       && this.get('labellingLayers').some( ll => ll.get('displayable') );
    }.property('labellingLayers.[]', 'labellingLayers.@each.displayable'),
    
    init() {
      this._super();
      if (!this.get('graphLayout')) {
        this.set('graphLayout', GraphLayout.createDefault());
      }
      this.set('graphLayers', Em.A());
      this.set('labellingLayers', Em.A());
    },
    
    importRawData(data) {
      this.set('graphLayers', Em.A());
      this.set('labellingLayers', Em.A());
      this.set('geoDef', null);
      this.set('data', DataStruct.createFromRawData(data));
      this.set('report', this.get('data').analyse());
    },
    
    export() {
      if (this.get('version') < 3) this.set('version', CURRENT_VERSION);
      return this._super({
        date: new Date(),
        version: this.get('version'),
        thumbnail: this.get('thumbnail'),
        data: this.get('data') ? LZString.compressToBase64(JSON.stringify(this.get('data').export())) : null,
        graphLayout: LZString.compressToBase64(JSON.stringify(this.get('graphLayout').export())),
        graphLayers: LZString.compressToBase64(JSON.stringify(this.get('graphLayers').map( gl => gl.export() ))),
        labellingLayers: this.get('labellingLayers').map( gl => gl.export() ),
        geoDef: this.get('geoDef') ? this.get('geoDef').export() : null,
        title: this.get('title'),
        dataSource: this.get('dataSource'),
        author: this.get('author'),
        comment: this.get('comment'),
        blindnessMode: this.get('blindnessMode'),
        report: this.get('report')
      });
    }
    
});

Project.reopenClass({
  
    createEmpty() {
      return Project.create({
        data: DataStruct.createFromRawData([])
      })
    },
    
    restore(json, refs = {}) {
      if (json.version && json.version >= 3) {
        json.data = (json.data && JSON.parse(LZString.decompressFromBase64(json.data))) || null;
        json.graphLayout = JSON.parse(LZString.decompressFromBase64(json.graphLayout));
        json.graphLayers = JSON.parse(LZString.decompressFromBase64(json.graphLayers));
      }
      let o = this._super(json, refs, {
        date: json.date,
        version: json.version,
        thumbnail: json.thumbnail,
        title: json.title,
        dataSource: json.dataSource,
        author: json.author,
        comment: json.comment,
        blindnessMode: json.blindnessMode,
        graphLayout: GraphLayout.restore(json.graphLayout, refs)
      });
      return new Promise( (res, rej) => {
        if (o.get('graphLayout.basemap')) {
          o.get('graphLayout.basemap').loadDictionaryData()
            .then( () => {
              res(o);
            });
        } else {
          res(o);
        }
      }).then( (o) => {
        o.setProperties({
          data: DataStruct.restore(json.data, refs),
          graphLayers: json.graphLayers.map( gl => GraphLayer.restore(gl, refs) ),
          labellingLayers: json.labellingLayers.map( gl => GraphLayer.restore(gl, refs) ),
          geoDef: json.geoDef ? GeoDef.restore(json.geoDef, refs) : null,
          report: json.report
        });
        return o;
      });
    }
    
});

export default Project;
