const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

// 获取负责人列表（支持筛选）
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      real_name,
      phone,
      permission_scope, // single / multiple
      farm_id
    } = req.query;

    const offset = (page - 1) * pageSize;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    // 数据权限：非超级管理员只能查看自己农场的负责人
    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    if (roleId !== 1) {
      if (!userFarmId) {
        console.log('非超级管理员且无农场ID，返回空列表');
        return res.json({ data: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
      }
      whereSql += ' AND fp.farm_id = ?';
      whereParams.push(userFarmId);
    }

    if (farm_id) {
      whereSql += ' AND fp.farm_id = ?';
      whereParams.push(farm_id);
    }

    if (real_name) {
      whereSql += ' AND u.real_name LIKE ?';
      whereParams.push(`%${real_name}%`);
    }

    if (phone) {
      whereSql += ' AND u.phone = ?';
      whereParams.push(phone);
    }

    // 先查询所有负责人，然后统计每个用户管理的农场数量
    const listSql = `
      SELECT 
        fp.binding_id,
        fp.farm_id,
        f.farm_name,
        fp.user_id,
        u.real_name,
        u.phone,
        r.role_name,
        fp.principal_type,
        fp.bind_time
      FROM farm_principal fp
      INNER JOIN farm f ON fp.farm_id = f.farm_id
      INNER JOIN user u ON fp.user_id = u.user_id
      INNER JOIN role r ON u.role_id = r.role_id
      ${whereSql}
      ORDER BY fp.bind_time DESC
    `;

    let principals = [];
    try {
      const [result] = await pool.execute(listSql, whereParams);
      principals = result || [];
      console.log(`查询到 ${principals.length} 条负责人记录`);
    } catch (sqlError) {
      console.error('SQL查询错误:', sqlError);
      // 如果表不存在，返回空列表并提示
      if (sqlError.code === 'ER_NO_SUCH_TABLE' || sqlError.message.includes('doesn\'t exist') || sqlError.message.includes('Unknown table')) {
        console.log('❌ 表 farm_principal 不存在！');
        console.log('请执行以下命令创建表:');
        console.log('mysql -u root -p smart_agriculture < server/migrations/add_principal_tables.sql');
        return res.status(500).json({ 
          message: '数据库表不存在，请先执行数据库迁移脚本',
          hint: '请执行: mysql -u root -p smart_agriculture < server/migrations/add_principal_tables.sql'
        });
      }
      throw sqlError;
    }

    // 统计每个用户管理的农场数量
    const userFarmCountMap = {};
    principals.forEach(p => {
      if (!userFarmCountMap[p.user_id]) {
        userFarmCountMap[p.user_id] = 0;
      }
      userFarmCountMap[p.user_id]++;
    });

    // 添加管理农场数量
    const principalsWithCount = principals.map(p => ({
      ...p,
      managed_farm_count: userFarmCountMap[p.user_id] || 1
    }));

    // 权限范围筛选
    let filteredPrincipals = principalsWithCount;
    if (permission_scope === 'single') {
      filteredPrincipals = principalsWithCount.filter(p => p.managed_farm_count === 1);
    } else if (permission_scope === 'multiple') {
      filteredPrincipals = principalsWithCount.filter(p => p.managed_farm_count > 1);
    }

    // 分页
    const paginatedPrincipals = filteredPrincipals.slice(offset, offset + parseInt(pageSize));

    // 获取权限配置
    const bindingIds = paginatedPrincipals.map(p => p.binding_id);
    const permissionMap = {};
    if (bindingIds.length > 0) {
      try {
        const [permissions] = await pool.execute(
          `SELECT binding_id, view_modules, operation_permissions 
           FROM principal_permission 
           WHERE binding_id IN (${bindingIds.map(() => '?').join(',')})`,
          bindingIds
        );
        permissions.forEach(p => {
          try {
            // MySQL JSON字段可能返回字符串或对象
            let viewModules = [];
            let operationPermissions = {};
            
            if (p.view_modules) {
              if (typeof p.view_modules === 'string') {
                viewModules = JSON.parse(p.view_modules);
              } else {
                viewModules = p.view_modules;
              }
            }
            
            if (p.operation_permissions) {
              if (typeof p.operation_permissions === 'string') {
                operationPermissions = JSON.parse(p.operation_permissions);
              } else {
                operationPermissions = p.operation_permissions;
              }
            }
            
            permissionMap[p.binding_id] = {
              view_modules: viewModules,
              operation_permissions: operationPermissions
            };
          } catch (parseError) {
            console.error(`解析权限配置失败 (binding_id: ${p.binding_id}):`, parseError);
            permissionMap[p.binding_id] = {
              view_modules: [],
              operation_permissions: {}
            };
          }
        });
      } catch (permError) {
        console.error('查询权限配置失败:', permError);
        // 如果表不存在或其他错误，继续执行，使用默认权限
      }
    }

    // 合并权限信息
    const result = paginatedPrincipals.map(p => ({
      ...p,
      permission: permissionMap[p.binding_id] || {
        view_modules: [],
        operation_permissions: {}
      },
      permission_scope: p.managed_farm_count === 1 ? 'single' : 'multiple'
    }));

    // 总数（筛选后的总数）
    const total = filteredPrincipals.length;
    console.log(`筛选后共 ${total} 条，当前页返回 ${result.length} 条`);

    res.json({
      data: result,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('获取负责人列表错误:', error);
    console.error('错误堆栈:', error.stack);
    res.status(500).json({ 
      message: '服务器错误', 
      error: error.message,
      code: error.code,
      sqlMessage: error.sqlMessage
    });
  }
});

// 获取可绑定的负责人列表（农场管理员角色）
router.get('/available', authenticateToken, async (req, res) => {
  try {
    const { farm_id } = req.query;
    const roleId = req.user.role_id;

    // 仅超级管理员和农场管理员可查看
    if (roleId !== 1 && roleId !== 2) {
      return res.status(403).json({ message: '无权查看可绑定负责人列表' });
    }

    // 查询所有农场管理员角色用户，并检查是否已绑定指定农场
    let users = [];
    try {
      const [result] = await pool.execute(
        `SELECT 
           u.user_id, 
           u.real_name, 
           u.phone,
           (SELECT GROUP_CONCAT(f.farm_name SEPARATOR '、')
            FROM farm_principal fp2
            INNER JOIN farm f ON fp2.farm_id = f.farm_id
            WHERE fp2.user_id = u.user_id
              AND fp2.farm_id != ?
            LIMIT 3) AS current_farm_name
         FROM user u
         WHERE u.role_id = 2
         ORDER BY u.real_name`,
        [farm_id || 0]
      );
      users = result || [];
    } catch (sqlError) {
      // 如果表不存在，只返回用户列表，不查询绑定信息
      if (sqlError.code === 'ER_NO_SUCH_TABLE' || sqlError.message.includes('doesn\'t exist')) {
        console.log('表 farm_principal 不存在，仅返回用户列表');
        const [userResult] = await pool.execute(
          `SELECT user_id, real_name, phone, NULL AS current_farm_name
           FROM user 
           WHERE role_id = 2
           ORDER BY real_name`
        );
        users = userResult || [];
      } else {
        throw sqlError;
      }
    }

    res.json(users);
  } catch (error) {
    console.error('获取可绑定负责人列表错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 绑定负责人（单个/批量）
router.post('/bind', authenticateToken, async (req, res) => {
  try {
    const { farm_id, user_ids, principal_type = '主' } = req.body;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;
    const operatorId = req.user.user_id;

    // 操作权限检查
    if (roleId !== 1 && userFarmId !== parseInt(farm_id)) {
      return res.status(403).json({ message: '无权绑定该农场的负责人' });
    }

    if (!farm_id || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ message: '请选择要绑定的农场和负责人' });
    }

    // 验证农场是否存在
    const [farms] = await pool.execute('SELECT farm_id FROM farm WHERE farm_id = ?', [farm_id]);
    if (farms.length === 0) {
      return res.status(404).json({ message: '农场不存在' });
    }

    // 检查是否已有主负责人
    if (principal_type === '主') {
      const [existing] = await pool.execute(
        'SELECT binding_id FROM farm_principal WHERE farm_id = ? AND principal_type = "主"',
        [farm_id]
      );
      if (existing.length > 0) {
        return res.status(400).json({ message: '该农场已有主负责人，请先解绑' });
      }
    }

    const bindResults = [];
    const errors = [];

    for (const user_id of user_ids) {
      try {
        // 检查用户是否存在且为农场管理员
        const [users] = await pool.execute(
          'SELECT user_id, role_id, real_name FROM user WHERE user_id = ?',
          [user_id]
        );
        if (users.length === 0 || users[0].role_id !== 2) {
          errors.push(`用户ID ${user_id} 不存在或不是农场管理员`);
          continue;
        }

        // 检查是否已绑定该农场
        const [existing] = await pool.execute(
          'SELECT binding_id, principal_type FROM farm_principal WHERE farm_id = ? AND user_id = ?',
          [farm_id, user_id]
        );
        if (existing.length > 0) {
          errors.push(`用户 ${users[0].real_name} 已绑定该农场`);
          continue;
        }

        // 检查是否已绑定其他农场
        const [otherFarms] = await pool.execute(
          `SELECT f.farm_name FROM farm_principal fp
           INNER JOIN farm f ON fp.farm_id = f.farm_id
           WHERE fp.user_id = ? AND fp.farm_id != ?`,
          [user_id, farm_id]
        );

        // 执行绑定
        const [result] = await pool.execute(
          'INSERT INTO farm_principal (farm_id, user_id, principal_type, bind_by) VALUES (?, ?, ?, ?)',
          [farm_id, user_id, principal_type, operatorId]
        );

        const bindingId = result.insertId;

        // 创建默认权限配置
        const defaultViewModules = JSON.stringify(['crop', 'device', 'warning', 'environment']);
        const defaultOperationPermissions = JSON.stringify({
          crop: 'view',
          device: 'view',
          warning: 'view',
          environment: 'view'
        });

        await pool.execute(
          'INSERT INTO principal_permission (binding_id, view_modules, operation_permissions, update_by) VALUES (?, ?, ?, ?)',
          [bindingId, defaultViewModules, defaultOperationPermissions, operatorId]
        );

        // 记录操作日志
        const logContent = `绑定${principal_type}负责人：${users[0].real_name}${otherFarms.length > 0 ? `（该用户已绑定其他农场：${otherFarms.map(f => f.farm_name).join('、')}）` : ''}`;
        await pool.execute(
          'INSERT INTO principal_operation_log (farm_id, user_id, operation_type, operation_content, operator_id) VALUES (?, ?, ?, ?, ?)',
          [farm_id, user_id, '绑定', logContent, operatorId]
        );

        bindResults.push({
          user_id,
          user_name: users[0].real_name,
          binding_id: bindingId,
          has_other_farms: otherFarms.length > 0
        });
      } catch (err) {
        console.error(`绑定用户 ${user_id} 失败:`, err);
        errors.push(`绑定用户ID ${user_id} 失败: ${err.message}`);
      }
    }

    if (bindResults.length === 0) {
      return res.status(400).json({ message: '绑定失败', errors });
    }

    res.json({
      message: `成功绑定 ${bindResults.length} 位负责人`,
      results: bindResults,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('绑定负责人错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 编辑权限
router.put('/permission/:bindingId', authenticateToken, async (req, res) => {
  try {
    const { bindingId } = req.params;
    const { view_modules, operation_permissions } = req.body;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;
    const operatorId = req.user.user_id;

    // 获取绑定信息
    const [bindings] = await pool.execute(
      'SELECT fp.*, f.farm_name, u.real_name FROM farm_principal fp INNER JOIN farm f ON fp.farm_id = f.farm_id INNER JOIN user u ON fp.user_id = u.user_id WHERE fp.binding_id = ?',
      [bindingId]
    );

    if (bindings.length === 0) {
      return res.status(404).json({ message: '绑定关系不存在' });
    }

    const binding = bindings[0];

    // 权限检查：超级管理员可配置所有权限，农场主负责人仅能分配副负责人权限
    if (roleId !== 1) {
      if (userFarmId !== binding.farm_id) {
        return res.status(403).json({ message: '无权修改该农场的负责人权限' });
      }
      // 检查操作人是否是主负责人
      const [operatorBinding] = await pool.execute(
        'SELECT principal_type FROM farm_principal WHERE farm_id = ? AND user_id = ?',
        [binding.farm_id, operatorId]
      );
      if (operatorBinding.length === 0 || operatorBinding[0].principal_type !== '主') {
        return res.status(403).json({ message: '仅主负责人可分配副负责人权限' });
      }
      // 农场主负责人只能配置副负责人的权限
      if (binding.principal_type === '主') {
        return res.status(403).json({ message: '农场主负责人不能修改自己的权限' });
      }
    }

    // 更新权限配置
    const viewModulesJson = JSON.stringify(view_modules || []);
    const operationPermissionsJson = JSON.stringify(operation_permissions || {});

    await pool.execute(
      `UPDATE principal_permission 
       SET view_modules = ?, operation_permissions = ?, update_by = ? 
       WHERE binding_id = ?`,
      [viewModulesJson, operationPermissionsJson, operatorId, bindingId]
    );

    // 记录操作日志
    const logContent = `修改权限：${binding.real_name}（${binding.farm_name}）`;
    await pool.execute(
      'INSERT INTO principal_operation_log (farm_id, user_id, operation_type, operation_content, operator_id) VALUES (?, ?, ?, ?, ?)',
      [binding.farm_id, binding.user_id, '改权限', logContent, operatorId]
    );

    res.json({ message: '权限更新成功' });
  } catch (error) {
    console.error('编辑权限错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 解除绑定（单个/批量）
router.delete('/unbind', authenticateToken, async (req, res) => {
  try {
    const { binding_ids, unbind_all_sub = false } = req.body;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;
    const operatorId = req.user.user_id;

    if (!binding_ids || !Array.isArray(binding_ids) || binding_ids.length === 0) {
      return res.status(400).json({ message: '请选择要解绑的负责人' });
    }

    // 获取绑定信息
    const [bindings] = await pool.execute(
      `SELECT fp.*, f.farm_name, u.real_name 
       FROM farm_principal fp 
       INNER JOIN farm f ON fp.farm_id = f.farm_id 
       INNER JOIN user u ON fp.user_id = u.user_id 
       WHERE fp.binding_id IN (${binding_ids.map(() => '?').join(',')})`,
      binding_ids
    );

    if (bindings.length === 0) {
      return res.status(404).json({ message: '未找到要解绑的绑定关系' });
    }

    // 权限检查
    for (const binding of bindings) {
      if (roleId !== 1 && userFarmId !== binding.farm_id) {
        return res.status(403).json({ message: `无权解绑农场 ${binding.farm_name} 的负责人` });
      }
      // 检查是否是主负责人
      if (binding.principal_type === '主') {
        const [operatorBinding] = await pool.execute(
          'SELECT principal_type FROM farm_principal WHERE farm_id = ? AND user_id = ?',
          [binding.farm_id, operatorId]
        );
        if (operatorBinding.length === 0 || (operatorBinding[0].principal_type !== '主' && roleId !== 1)) {
          return res.status(403).json({ message: '仅超级管理员或主负责人可解绑主负责人' });
        }
      }
    }

    // 如果解绑主负责人，检查是否需要解绑所有副负责人
    const mainBindings = bindings.filter(b => b.principal_type === '主');
    if (mainBindings.length > 0 && unbind_all_sub) {
      for (const mainBinding of mainBindings) {
        const [subBindings] = await pool.execute(
          'SELECT binding_id FROM farm_principal WHERE farm_id = ? AND principal_type = "副"',
          [mainBinding.farm_id]
        );
        binding_ids.push(...subBindings.map(b => b.binding_id));
      }
    }

    // 执行解绑
    const unbindResults = [];
    for (const binding of bindings) {
      try {
        // 删除权限配置
        await pool.execute('DELETE FROM principal_permission WHERE binding_id = ?', [binding.binding_id]);

        // 删除绑定关系
        await pool.execute('DELETE FROM farm_principal WHERE binding_id = ?', [binding.binding_id]);

        // 记录操作日志
        const logContent = `解除绑定：${binding.real_name}（${binding.farm_name}）`;
        await pool.execute(
          'INSERT INTO principal_operation_log (farm_id, user_id, operation_type, operation_content, operator_id) VALUES (?, ?, ?, ?, ?)',
          [binding.farm_id, binding.user_id, '解绑', logContent, operatorId]
        );

        unbindResults.push({
          binding_id: binding.binding_id,
          user_name: binding.real_name,
          farm_name: binding.farm_name
        });
      } catch (err) {
        console.error(`解绑 ${binding.binding_id} 失败:`, err);
      }
    }

    res.json({
      message: `成功解绑 ${unbindResults.length} 位负责人`,
      results: unbindResults
    });
  } catch (error) {
    console.error('解除绑定错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 获取操作日志
router.get('/logs', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      farm_id,
      operation_type,
      time_from,
      time_to
    } = req.query;

    const offset = (page - 1) * pageSize;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    // 数据权限
    if (roleId !== 1) {
      if (!userFarmId) {
        return res.json({ data: [], total: 0, page: parseInt(page), pageSize: parseInt(pageSize) });
      }
      whereSql += ' AND pol.farm_id = ?';
      whereParams.push(userFarmId);
    }

    if (farm_id) {
      whereSql += ' AND pol.farm_id = ?';
      whereParams.push(farm_id);
    }

    if (operation_type) {
      whereSql += ' AND pol.operation_type = ?';
      whereParams.push(operation_type);
    }

    if (time_from) {
      whereSql += ' AND pol.operation_time >= ?';
      whereParams.push(`${time_from} 00:00:00`);
    }

    if (time_to) {
      whereSql += ' AND pol.operation_time <= ?';
      whereParams.push(`${time_to} 23:59:59`);
    }

    const limitClause = `LIMIT ${Number(pageSize)} OFFSET ${Number(offset)}`;
    const [logs] = await pool.execute(
      `SELECT 
        pol.log_id,
        pol.farm_id,
        f.farm_name,
        pol.user_id,
        u.real_name,
        pol.operation_type,
        pol.operation_content,
        pol.operation_time,
        pol.operator_id,
        op.real_name AS operator_name
       FROM principal_operation_log pol
       LEFT JOIN farm f ON pol.farm_id = f.farm_id
       LEFT JOIN user u ON pol.user_id = u.user_id
       LEFT JOIN user op ON pol.operator_id = op.user_id
       ${whereSql}
       ORDER BY pol.operation_time DESC
       ${limitClause}`,
      whereParams
    );

    // 总数
    const [countResult] = await pool.execute(
      `SELECT COUNT(*) AS total
       FROM principal_operation_log pol
       ${whereSql}`,
      whereParams
    );
    const total = countResult[0].total;

    res.json({
      data: logs,
      total,
      page: parseInt(page),
      pageSize: parseInt(pageSize)
    });
  } catch (error) {
    console.error('获取操作日志错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

// 导出操作日志为CSV
router.get('/logs/export', authenticateToken, async (req, res) => {
  try {
    const { farm_id, operation_type, time_from, time_to } = req.query;
    const roleId = req.user.role_id;
    const userFarmId = req.user.farm_id;

    let whereSql = 'WHERE 1=1';
    const whereParams = [];

    if (roleId !== 1) {
      if (!userFarmId) {
        return res.status(200).send('farm_name,user_name,operation_type,operation_content,operation_time,operator_name\n');
      }
      whereSql += ' AND pol.farm_id = ?';
      whereParams.push(userFarmId);
    }

    if (farm_id) {
      whereSql += ' AND pol.farm_id = ?';
      whereParams.push(farm_id);
    }

    if (operation_type) {
      whereSql += ' AND pol.operation_type = ?';
      whereParams.push(operation_type);
    }

    if (time_from) {
      whereSql += ' AND pol.operation_time >= ?';
      whereParams.push(`${time_from} 00:00:00`);
    }

    if (time_to) {
      whereSql += ' AND pol.operation_time <= ?';
      whereParams.push(`${time_to} 23:59:59`);
    }

    const [logs] = await pool.execute(
      `SELECT 
        f.farm_name,
        u.real_name AS user_name,
        pol.operation_type,
        pol.operation_content,
        pol.operation_time,
        op.real_name AS operator_name
       FROM principal_operation_log pol
       LEFT JOIN farm f ON pol.farm_id = f.farm_id
       LEFT JOIN user u ON pol.user_id = u.user_id
       LEFT JOIN user op ON pol.operator_id = op.user_id
       ${whereSql}
       ORDER BY pol.operation_time DESC`,
      whereParams
    );

    const header = 'farm_name,user_name,operation_type,operation_content,operation_time,operator_name\n';
    const body = logs.map(log => {
      const wrap = (val) => {
        if (val == null) return '';
        const s = String(val).replace(/"/g, '""');
        return `"${s}"`;
      };
      return [
        wrap(log.farm_name),
        wrap(log.user_name),
        wrap(log.operation_type),
        wrap(log.operation_content),
        wrap(log.operation_time),
        wrap(log.operator_name)
      ].join(',');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="principal_logs.csv"');
    res.status(200).send(header + body);
  } catch (error) {
    console.error('导出操作日志错误:', error);
    res.status(500).json({ message: '服务器错误', error: error.message });
  }
});

module.exports = router;

