// Schema plugin for collections that hold one settings record (temple Settings, attendance,
// payroll, bookings).
//
// getOrCreate() used to read and, finding nothing, create. Two requests reaching an empty
// collection at the same moment each created a record, and later reads could pick either one.
// A record made here carries the key `singleton: 'main'` under a unique index, so the second
// create fails and that request reads the record that won. Records made before this change
// have no key and are not covered by the index; the oldest record is always the one used.

export default function singleton(schema) {
  schema.add({ singleton: { type: String, immutable: true } });
  schema.index({ singleton: 1 }, { unique: true, partialFilterExpression: { singleton: { $exists: true } } });

  schema.statics.getOrCreate = async function getOrCreate() {
    const found = await this.findOne().sort({ _id: 1 });
    if (found) return found;
    try {
      return await this.create({ singleton: 'main' });
    } catch (err) {
      if (err.code !== 11000) throw err;
      return this.findOne({ singleton: 'main' });
    }
  };
}
