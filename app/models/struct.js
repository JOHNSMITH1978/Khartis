import Ember from 'ember';

let Struct = Ember.Object.extend({
   _uuid: null,
   
   _defferedChangeIndicator: null,
   
   notifyDefferedChange() {
     this.set('_defferedChangeIndicator', (new Date()).getTime()+Math.random());
   },
   
   init() {
      if (!this.get('_uuid')) {
          this.set('_uuid', Struct._nextId.next().value);
      }
   },
   export(opts) {
      return Object.assign({
          _uuid: this.get('_uuid')
      }, opts);
   }
});

Struct.reopenClass({
    _nextId: (function*() {
      for (let i = 0,
          t = 0,
          time;;) {
          yield `${ ( time = new Date().getTime() ).toString(32) }${ ( i = ( t == time ? i+1 : 0*(t = time) ) ).toString(32) }`;
      }
    })(),
    restore(json, refs) {
      return refs[json._uuid] = this.create({_uuid: json._uuid});
    }
});

export default Struct;
